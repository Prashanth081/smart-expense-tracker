const http = require('http');

const data = JSON.stringify({
    merchant: "TestRecurring",
    date: new Date().toISOString(),
    category: "Other",
    amount: -15,
    type: "expense",
    notes: "",
    isRecurring: true,
    frequency: 'Monthly',
    nextDate: '2024-06-24'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/transactions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => {
        responseBody += chunk;
    });
    res.on('end', () => {
        console.log(`Status code: ${res.statusCode}`);
        console.log(`Response: ${responseBody}`);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(data);
req.end();
