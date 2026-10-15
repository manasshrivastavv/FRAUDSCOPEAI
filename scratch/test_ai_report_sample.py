import urllib.request
import json

url = 'http://127.0.0.1:8000/api/reports/generate'
payload = {
    'content': 'Bank account kiraye pe available hai! Fresh current account with linked SIM card aur ATM card + PIN ready for immediate delivery. Urgent buyers only message on Telegram @CashDropDeal or call +91 98765 43210. 100% genuine guaranteed.',
    'input_type': 'message',
    'source_type': 'manual_scan'
}
req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode('utf-8'))

print('REPORT ID:', data.get('report_id'))
print('VERDICT:', data.get('verdict'))
print('RISK SCORE:', data.get('risk_score'))
print('SEVERITY:', data.get('severity'))
print('INDICATORS COUNT:', len(data.get('indicators', [])))
for ind in data.get('indicators', []):
    print(f" - {ind['indicator_name']}: {ind['observed_evidence']} [{ind['verification_status']}]")
print('EXECUTIVE SUMMARY:', data.get('executive_summary'))
print('AI MODEL:', data.get('model_analysis', {}).get('prediction'), 'Prob:', data.get('model_analysis', {}).get('suspicious_probability'))
print('POTENTIAL IMPACTS:', data.get('potential_impacts'))
print('RECOMMENDED ACTIONS:', data.get('recommended_actions'))
