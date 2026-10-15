import urllib.request
import json

def test_url(target_url):
    url = 'http://127.0.0.1:8000/api/reports/generate'
    payload = {
        'url': target_url,
        'input_type': 'url',
        'source_type': 'manual_scan'
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))

    print('='*50)
    print('TARGET URL:', target_url)
    print('REPORT ID:', data.get('report_id'))
    print('VERDICT:', data.get('verdict'))
    print('RISK SCORE:', data.get('risk_score'))
    print('SEVERITY:', data.get('severity'))
    print('INDICATORS:', [(i['indicator_name'], i['observed_evidence']) for i in data.get('indicators', [])])
    print('URL ANALYSIS:', data.get('url_analysis'))
    print('MODEL NOTICE:', data.get('model_analysis', {}).get('important_limitations'))

test_url('http://127.0.0.1:8000/internal-secrets')
test_url('https://www.google.com')
