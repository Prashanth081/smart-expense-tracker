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
        df = pd.read_sql_query("SELECT * FROM transactions", conn)
        
        if 'merchant' not in df.columns:
            df['merchant'] = 'Unknown'
        
        # Load subscriptions
        sub_query = "SELECT * FROM recurring_subscriptions"
        subs_df = pd.read_sql_query(sub_query, conn)
        
        conn.close()

        if len(df) == 0:
            return json.dumps({
                "status": "insufficient_data",
                "message": "Not enough data for ML predictions."
            })
            
        # Convert date strings to datetime objects
        df['date'] = pd.to_datetime(df['date'], format='mixed', utc=True)
        
        # Ensure 'amount' is float and positive for calculation
        df['amount'] = df['amount'].astype(float).abs()

        # Limit to last 2 months (60 days) for predictions
        max_date = df['date'].max()
        now = pd.Timestamp.now(tz='UTC')
        cutoff_date = max_date - pd.Timedelta(days=60)
        proj_df = df[df['date'] >= cutoff_date]

        expenses_df = proj_df[proj_df['type'].str.lower() == 'expense'].copy()
        income_df = proj_df[proj_df['type'].str.lower() == 'income'].copy()
        
        if len(expenses_df) < 3:
            return json.dumps({
                "status": "insufficient_data",
                "message": "We need more expense records to run ML algorithms. Please add at least 3 transactions."
            })
            
        # 1. Base ML Data Preparation
        expenses_df['date_ordinal'] = expenses_df['date'].map(pd.Timestamp.toordinal)
        expenses_daily = expenses_df.groupby('date_ordinal')['amount'].sum().reset_index()
        
        model = LinearRegression()
        if not expenses_daily.empty:
            model.fit(expenses_daily[['date_ordinal']], expenses_daily['amount'])
        
        # 2. Calculate Committe Subscriptions (Occurrence-based)
        sub_expense_next_month = 0
        sub_income_next_month = 0
        if not subs_df.empty:
            for _, sub in subs_df.iterrows():
                try:
                    s_date = pd.to_datetime(sub['next_date'], utc=True)
                    freq = sub['frequency'].lower()
                    amt = abs(float(sub['amount']))
                    
                    check_d = s_date
                    end_d = now + pd.Timedelta(days=30)
                    while now <= check_d <= end_d:
                        if sub['type'].lower() == 'expense':
                            sub_expense_next_month += amt
                        else:
                            sub_income_next_month += amt
                        
                        if freq == 'weekly': check_d += pd.Timedelta(weeks=1)
                        elif freq == 'monthly': check_d += pd.DateOffset(months=1)
                        elif freq == 'yearly': check_d += pd.DateOffset(years=1)
                        else: break
                except: continue
        
        # 3. Last Month Variable Spend Calculation
        # Identify last month
        first_day_cm = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_lm = first_day_cm - pd.Timedelta(days=1)
        first_day_lm = last_day_lm.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        lm_df = df[(df['date'] >= first_day_lm) & (df['date'] <= last_day_lm) & (df['type'].str.lower() == 'expense')]
        lm_total_exp = lm_df['amount'].sum()
        
        # Estimate LM recurring (best effort)
        lm_recurring = 0
        if not subs_df.empty:
            for _, sub in subs_df.iterrows():
                try:
                    if sub['type'].lower() != 'expense': continue
                    s_date = pd.to_datetime(sub['next_date'], utc=True)
                    freq = sub['frequency'].lower()
                    amt = abs(float(sub['amount']))
                    # Look back to find if it hit LM
                    check_d = s_date
                    while check_d > first_day_lm:
                        if first_day_lm <= check_d <= last_day_lm:
                            lm_recurring += amt
                        if freq == 'weekly': check_d -= pd.Timedelta(weeks=1)
                        elif freq == 'monthly': check_d -= pd.DateOffset(months=1)
                        elif freq == 'yearly': check_d -= pd.DateOffset(years=1)
                        else: break
                except: continue
        
        lm_variable_exp = max(0, lm_total_exp - lm_recurring)
        
        # Calculate historical daily average for current month extrapolation
        historical_daily_avg = 500 # Default fallback
        if not expenses_daily.empty:
            historical_daily_avg = float(expenses_daily['amount'].median()) if len(expenses_daily) > 2 else float(expenses_daily['amount'].mean())

        # 4. Current Month Projection (Actual + Remaining Variable + Remaining Subs)
        current_month = now.month
        current_year = now.year
        actual_cm_exp = df[(df['date'].dt.month == current_month) & (df['date'].dt.year == current_year) & (df['type'].str.lower() == 'expense')]['amount'].sum()
        actual_cm_inc = df[(df['date'].dt.month == current_month) & (df['date'].dt.year == current_year) & (df['type'].str.lower() == 'income')]['amount'].sum()
        
        days_in_month = pd.Period(f"{current_year}-{current_month}").days_in_month
        remaining_days = max(0, days_in_month - now.day)
        
        remaining_subs_this_month = 0
        if not subs_df.empty:
            for _, sub in subs_df.iterrows():
                try:
                    if sub['type'].lower() != 'expense': continue
                    s_date = pd.to_datetime(sub['next_date'], utc=True)
                    freq = sub['frequency'].lower()
                    amt = abs(float(sub['amount']))
                    check_d = s_date
                    while check_d.month == current_month and check_d.year == current_year:
                        if check_d > now: remaining_subs_this_month += amt
                        if freq == 'weekly': check_d += pd.Timedelta(weeks=1)
                        elif freq == 'monthly': check_d += pd.DateOffset(months=1)
                        else: break
                except: continue

        proj_cm_exp = actual_cm_exp + remaining_subs_this_month + (historical_daily_avg * remaining_days)
        proj_cm_inc = max(actual_cm_inc, sub_income_next_month)

        # 5. Next Month Prediction (Consolidated from Category-Specific Projections for consistency)
        category_projections = {}
        df['month_year'] = df['date'].dt.strftime('%Y-%m')
        
        # Category Logic
        historical_monthly_exp = df[df['type'].str.lower() == 'expense'].groupby('month_year')['amount'].sum()
        historical_monthly_inc = df[df['type'].str.lower() == 'income'].groupby('month_year')['amount'].sum()
        
        current_my = now.strftime('%Y-%m')
        months_list = sorted(historical_monthly_exp.index.tolist())
        past_months = [m for m in months_list if m < current_my][-2:] 
        exp_values = [historical_monthly_exp[m] for m in past_months]
        inc_values = [historical_monthly_inc.get(m, 0) for m in past_months]

        if not df.empty:
            cat_monthly = df[df['type'].str.lower() == 'expense'].groupby(['month_year', 'category'])['amount'].sum().unstack(fill_value=0)
            if not cat_monthly.empty:
                cat_averages = cat_monthly.mean()
                for cat in cat_monthly.columns:
                    cat_series = cat_monthly[cat]
                    actual_cm = cat_series.iloc[-1]
                    
                    # Category future subs
                    cat_future_subs = 0
                    if not subs_df.empty and 'category' in subs_df.columns and 'type' in subs_df.columns:
                        cat_subs = subs_df[(subs_df['category'] == cat) & (subs_df['type'].str.lower() == 'expense')]
                        for _, sub in cat_subs.iterrows():
                            try:
                                s_date = pd.to_datetime(sub['next_date'], utc=True)
                                if now < s_date <= (now + pd.Timedelta(days=30)):
                                    cat_future_subs += abs(float(sub['amount']))
                            except: continue
                    
                    days_passed = max(1, now.day)
                    rem_days = max(0, days_in_month - now.day)
                    daily_avg = actual_cm / days_passed
                    
                    if cat_future_subs > 0:
                        proj_30d = actual_cm + cat_future_subs + (min(daily_avg, 50) * rem_days) 
                    else:
                        proj_30d = actual_cm + (daily_avg * rem_days)
                    category_projections[cat] = proj_30d


        next_month_total = sum(category_projections.values()) if category_projections else (historical_daily_avg * 30)
        
        # Ensure we don't deviate too wildly from rolling 3-month average
        rolling_avg = sum(exp_values) / len(exp_values) if exp_values else next_month_total
        next_month_total = (0.8 * next_month_total) + (0.2 * rolling_avg)
        
        next_month_income = sum(inc_values) / len(inc_values) if inc_values else actual_cm_inc
        
        # 6. Prediction Stats (Next Week)
        last_date = expenses_daily['date_ordinal'].max() if not expenses_daily.empty else now.toordinal()
        next_week_total = (historical_daily_avg * 7) + (remaining_subs_this_month / 4) # Rough estimate for week
        
        # Calculate historical deltas against exactly previous trailing periods
        last_7_days_amt = expenses_df[expenses_df['date_ordinal'] > last_date - 7]['amount'].sum()
        week_delta_pct = ((next_week_total / max(1, last_7_days_amt)) - 1) * 100 if last_7_days_amt > 0 else 0.0

        last_30_days_amt = expenses_df[expenses_df['date_ordinal'] > last_date - 30]['amount'].sum()
        month_delta_pct = ((next_month_total / max(1, last_30_days_amt)) - 1) * 100 if last_30_days_amt > 0 else 0.0
        
        # Income Prediction (Next Month)
        next_month_income = 0
        if not income_df.empty:
            income_df['month_year'] = income_df['date'].dt.strftime('%Y-%m')
            monthly_income = income_df.groupby('month_year')['amount'].sum()
            
            if len(monthly_income) >= 3:
                # Use linear regression on monthly totals for trend
                months_idx = np.arange(len(monthly_income)).reshape(-1, 1)
                inc_model = LinearRegression()
                inc_model.fit(months_idx, monthly_income.values)
                next_month_income = max(0, float(inc_model.predict([[len(monthly_income)]])[0]))
            else:
                # Use mean of available months
                next_month_income = float(monthly_income.mean())
            
        # Ensure we show the "high" income if subscriptions or current month are higher than trend
        next_month_income = max(next_month_income, sub_income_next_month, actual_cm_inc)
        proj_cm_inc = max(actual_cm_inc, next_month_income) # Extrapolate current month if trend is higher
            
        next_month_profit = next_month_income - next_month_total
        
        # 2. Budget Suggestion
        total_income = income_df['amount'].sum() if not income_df.empty else 0
        total_expense = expenses_df['amount'].sum()
        days_active = max(1, (expenses_df['date'].max() - expenses_df['date'].min()).days)
        
        monthly_income_est = total_income / max(1, (days_active/30.0))
        
        # Aggressive AI suggestion: Try to save 25% of estimated income
        suggested_budget = max(0, monthly_income_est * 0.75) 

        if suggested_budget == 0 or suggested_budget < next_month_total:
            # If no income data or the linear regression suggests expenses are going to exceed their 75% income cap
            # Provide a dynamic budget that is 5% lower than ML predicted expenses
            suggested_budget = max(500, next_month_total * 0.95)
            
        # 3. Category-Specific Next Month Alerts
        category_alerts = []
        if not df.empty:
            # Group by month and category to see trends
            cat_monthly = df[df['type'].str.lower() == 'expense'].groupby(['month_year', 'category'])['amount'].sum().unstack(fill_value=0)
            
            if not cat_monthly.empty:
                cat_averages = cat_monthly.mean()

        # 3. Category-Specific Next Month Alerts
        category_alerts = []
        if not df.empty and 'cat_averages' in locals() and category_projections:
            # Find the category with the highest absolute increase (Primary Driver)
            category_surpluses = []
            for cat, proj_30d in category_projections.items():
                avg = cat_averages.get(cat, 0)
                surplus = proj_30d - avg
                category_surpluses.append((cat, surplus, proj_30d, avg))

            # Sort by surplus descending
            category_surpluses.sort(key=lambda x: x[1], reverse=True)
            
            if category_surpluses:
                top_cat, top_surplus, top_proj, top_avg = category_surpluses[0]
                if top_surplus > 0:
                    diff_pct = (top_surplus / top_avg * 100) if top_avg > 0 else 100
                    category_alerts.append(f"🚩 Primary Driver: '{top_cat}' is your highest gaining expense type. It's projected to hit ₹{top_proj:,.2f}, which is {diff_pct:.0f}% above your normal baseline.")

            # Add other significant trends
            for cat, surplus, proj, avg in category_surpluses[1:3]:
                if surplus > avg * 0.15:
                    diff_pct = (surplus / avg * 100)
                    category_alerts.append(f"🔍 Category Alert: '{cat}' is projected to reach ₹{proj:,.2f} ({diff_pct:.0f}% increase).")
                elif surplus < -avg * 0.25:
                    diff_pct = abs(surplus / avg * 100)
                    category_alerts.append(f"📉 Improvement: '{cat}' expenses are cooling down to ₹{proj:,.2f}.")

        # 4. Spending Alerts (General)
        recent_cutoff = expenses_df['date'].max() - pd.Timedelta(days=7)
        recent_data = expenses_df[expenses_df['date'] > recent_cutoff]
        recent_expenses = recent_data['amount'].sum()
        
        # Compare last 7 days to average 7-day period
        avg_weekly_expense = total_expense / max(1, (days_active/7.0))
        
        alerts = []
        
        # Add category alerts
        alerts.extend(category_alerts)
        
        if not category_alerts:
            alerts.append("👍 Stable: Your spending habits across all categories are historically stable.")
            
        # 5. Trend Analysis
        slope = model.coef_[0]
        if slope > 0.5:
            trend_dir = "Increasing"
            trend_desc = "Your daily expenses are trending up over time."
        elif slope < -0.5:
            trend_dir = "Decreasing"
            trend_desc = "Your daily expenses are trending down over time."
        else:
            trend_dir = "Stable"
            trend_desc = "Your spending habits are historically stable."
            
        # Monthly grouping for chart
        df['month_year'] = df['date'].dt.strftime('%Y-%m')
        monthly_trend_data = df[df['type'].str.lower() == 'expense'].groupby('month_year')['amount'].sum().to_dict()

        # Daily grouping for the new line chart (current month only)
        curr_month_df = df[(df['date'].dt.month == current_month) & (df['date'].dt.year == current_year)].copy()
        daily_exp = curr_month_df[curr_month_df['type'].str.lower() == 'expense'].groupby(curr_month_df['date'].dt.day)['amount'].sum().abs().to_dict()
        daily_inc = curr_month_df[curr_month_df['type'].str.lower() == 'income'].groupby(curr_month_df['date'].dt.day)['amount'].sum().abs().to_dict()
        
        # Fill missing days (1-31)
        days_in_month = pd.Period(f"{current_year}-{current_month}").days_in_month
        daily_exp_full = {str(d): float(daily_exp.get(d, 0)) for d in range(1, days_in_month + 1)}
        daily_inc_full = {str(d): float(daily_inc.get(d, 0)) for d in range(1, days_in_month + 1)}

        # 6. Money Personality Logic (Weekend vs Weekday Discipline)
        personality = {
            "persona": "Balanced Planner",
            "score": 75,
            "description": "You manage your expenses smartly. Try reducing weekend spikes to save more!",
            "weekend_pct": 0
        }
        
        if not expenses_df.empty:
            expenses_df['day_name'] = expenses_df['date'].dt.day_name()
            expenses_df['is_weekend'] = expenses_df['day_name'].isin(['Saturday', 'Sunday'])
            
            weekend_spend = expenses_df[expenses_df['is_weekend']]['amount'].abs().sum()
            weekday_spend = expenses_df[~expenses_df['is_weekend']]['amount'].abs().sum()
            total_spend = weekend_spend + weekday_spend
            
            if total_spend > 0:
                weekend_pct = (weekend_spend / total_spend) * 100
                personality['weekend_pct'] = float(weekend_pct)
                
                # Logic: Weekends are only 2/7 (28%) of the week. 
                # If weekend spending is > 40%, it's high.
                if weekend_pct > 50:
                    personality['persona'] = "Weekend Warrior"
                    personality['score'] = max(40, 100 - int(weekend_pct))
                    personality['description'] = "Your weekend spending is significantly higher than your weekday average. Careful with those Saturday splurges!"
                elif weekend_pct > 35:
                    personality['persona'] = "Social Spender"
                    personality['score'] = 70
                    personality['description'] = "You tend to enjoy your weekends! A small reduction in leisure spend could boost your savings."
                else:
                    personality['persona'] = "Balanced Planner"
                    personality['score'] = min(95, 100 - int(weekend_pct/2))
                    personality['description'] = "You maintain great discipline throughout the week, including weekends. Excellent consistency!"

        # 7. Format Recurring Subscriptions for Dashboard Pulse
        recurring_list = []
        if not subs_df.empty:
            for _, sub in subs_df.iterrows():
                recurring_list.append({
                    "merchant": sub['merchant_name'] if 'merchant_name' in sub else sub.get('merchant', 'Unknown'),
                    "amount": float(sub['amount']),
                    "category": sub['category'],
                    "frequency": sub['frequency'],
                    "next_date": sub['next_date'],
                    "confidence": 0.95, # High confidence for confirmed recurring entries
                    "type": sub['type']
                })

        response = {
            "status": "success",
            "prediction": {
                "next_week": float(next_week_total),
                "next_week_delta_pct": float(week_delta_pct),
                "next_month": float(next_month_total),
                "next_month_delta_pct": float(month_delta_pct),
                "next_month_income": float(next_month_income),
                "projected_current_month_expense": proj_cm_exp,
                "projected_current_month_income": proj_cm_inc,
                "category_projections": {k: float(v) for k, v in category_projections.items()}
            },
            "recurring": recurring_list,
            "personality": personality,
            "budget": {
                "suggested_monthly": suggested_budget
            },
            "alerts": alerts,
            "trend": {
                "direction": trend_dir,
                "description": trend_desc,
                "slope": float(slope),
                "monthly_data": monthly_trend_data,
                "daily_expenses": daily_exp_full,
                "daily_income": daily_inc_full
            }
        }
        
        conn.close()
        return json.dumps(response)

    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

if __name__ == "__main__":
    print(generate_insights())
