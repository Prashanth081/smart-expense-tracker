import sqlite3
import json
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import warnings

warnings.filterwarnings("ignore")

def generate_insights():
    try:
        conn = sqlite3.connect('database.sqlite')
        
        # Load transactions
        query = "SELECT date, amount, type FROM transactions"
        df = pd.read_sql_query(query, conn)
        conn.close()

        if len(df) == 0:
            return json.dumps({
                "status": "insufficient_data",
                "message": "Not enough data for ML predictions."
            })
            
        # Convert date strings to datetime objects
        df['date'] = pd.to_datetime(df['date'])
        
        # Ensure 'amount' is float and positive for calculation
        df['amount'] = df['amount'].astype(float).abs()

        expenses_df = df[df['type'].str.lower() == 'expense'].copy()
        income_df = df[df['type'].str.lower() == 'income'].copy()
        
        if len(expenses_df) < 3:
            return json.dumps({
                "status": "insufficient_data",
                "message": "We need more expense records to run ML algorithms. Please add at least 3 transactions."
            })
            
        # 1. Expenses Prediction (Next Week/Month) using Linear Regression
        expenses_df['date_ordinal'] = expenses_df['date'].map(pd.Timestamp.toordinal)
        expenses_daily = expenses_df.groupby('date_ordinal')['amount'].sum().reset_index()
        
        model = LinearRegression()
        X = expenses_daily[['date_ordinal']]
        y = expenses_daily['amount']
        model.fit(X, y)
        
        # Predict for next 7 days
        last_date = expenses_daily['date_ordinal'].max() if not expenses_daily.empty else pd.Timestamp.now().toordinal()
        next_week_ordinals = np.array([last_date + i for i in range(1, 8)]).reshape(-1, 1)
        next_week_preds = model.predict(next_week_ordinals)
        next_week_total = max(0, float(np.sum(next_week_preds)))
        
        # Predict for next 30 days
        next_month_ordinals = np.array([last_date + i for i in range(1, 31)]).reshape(-1, 1)
        next_month_preds = model.predict(next_month_ordinals)
        next_month_total = max(0, float(np.sum(next_month_preds)))
        
        # Calculate historical deltas against exactly previous trailing periods
        last_7_days_amt = expenses_df[expenses_df['date_ordinal'] > last_date - 7]['amount'].sum()
        week_delta_pct = ((next_week_total / max(1, last_7_days_amt)) - 1) * 100 if last_7_days_amt > 0 else 0.0

        last_30_days_amt = expenses_df[expenses_df['date_ordinal'] > last_date - 30]['amount'].sum()
        month_delta_pct = ((next_month_total / max(1, last_30_days_amt)) - 1) * 100 if last_30_days_amt > 0 else 0.0
        
        # 2. Budget Suggestion
        total_income = income_df['amount'].sum() if not income_df.empty else 0
        total_expense = expenses_df['amount'].sum()
        days_active = max(1, (expenses_df['date'].max() - expenses_df['date'].min()).days)
        
        monthly_income_est = total_income / max(1, (days_active/30.0))
        monthly_expense_est = total_expense / max(1, (days_active/30.0))
        
        suggested_budget = max(0, monthly_income_est * 0.75) # Aggressive AI suggestion: Try to save 25% of estimated income
        if suggested_budget == 0 or suggested_budget < next_month_total:
            # If no income data or the linear regression suggests expenses are going to exceed their 75% income cap
            # Provide a dynamic budget that is 5% lower than ML predicted expenses
            suggested_budget = max(500, next_month_total * 0.95)
            
        # 3. Spending Alerts
        recent_cutoff = expenses_df['date'].max() - pd.Timedelta(days=7)
        recent_expenses = expenses_df[expenses_df['date'] > recent_cutoff]['amount'].sum()
        
        # Compare last 7 days to average 7-day period
        avg_weekly_expense = total_expense / max(1, (days_active/7.0))
        
        alerts = []
        if recent_expenses > avg_weekly_expense * 1.15:
            percent_over = ((recent_expenses/avg_weekly_expense)-1)*100
            alerts.append(f"⚠️ Overspending Warning: Your spending in the last 7 days (${recent_expenses:.2f}) is {percent_over:.0f}% higher than your historical weekly average.")
            alerts.append("Consider reviewing your recent 'Lifestyle' and 'Shopping' purchases to stay aligned with ML estimates.")
        elif recent_expenses < avg_weekly_expense * 0.85:
            percent_under = ((1-(recent_expenses/avg_weekly_expense))*100)
            alerts.append(f"✅ Great job! You spent {percent_under:.0f}% less this week compared to your average.")
        else:
            alerts.append("👍 Your recent spending is exactly on track with your historical baseline.")
            
        # 4. Trend Analysis
        slope = model.coef_[0]
        if slope > 0.5:
            trend = "Increasing"
            trend_desc = "Your daily expenses are trending up over time."
        elif slope < -0.5:
            trend = "Decreasing"
            trend_desc = "Your daily expenses are trending down over time."
        else:
            trend = "Stable"
            trend_desc = "Your spending habits are historically stable and consistent."
            
        # Monthly grouping for chart
        df['month_year'] = df['date'].dt.strftime('%Y-%m')
        monthly_trend = df[df['type'].str.lower() == 'expense'].groupby('month_year')['amount'].sum().to_dict()

        result = {
            "status": "success",
            "prediction": {
                "next_week": next_week_total,
                "next_week_delta_pct": float(week_delta_pct),
                "next_month": next_month_total,
                "next_month_delta_pct": float(month_delta_pct)
            },
            "budget": {
                "suggested_monthly": suggested_budget
            },
            "alerts": alerts,
            "trend": {
                "direction": trend,
                "description": trend_desc,
                "slope": float(slope),
                "monthly_data": monthly_trend
            }
        }
        
        return json.dumps(result)
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        })

if __name__ == '__main__':
    print(generate_insights())
