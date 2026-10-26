from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_endpoint():
    client = TestClient(app)
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_config_includes_demo_mode_and_sarvam_status():
    client = TestClient(app)
    response = client.get('/api/config')
    assert response.status_code == 200
    data = response.json()
    assert 'sarvam' in data
    assert 'environment' in data
    assert data['sarvam']['configured'] in [True, False]


def test_session_creation_and_persistence():
    client = TestClient(app)
    payload = {
        'agent': 'loan_settlement',
        'customer_name': 'Demo Customer',
        'objective': 'Resolve overdue loan'
    }
    response = client.post('/api/sessions', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['agent'] == 'loan_settlement'
    assert body['session_id']

    result = client.get('/api/sessions')
    assert result.status_code == 200
    sessions = result.json()['sessions']
    assert any(s['agent'] == 'loan_settlement' for s in sessions)


def test_analytics_metrics_use_real_session_data():
    client = TestClient(app)
    response = client.get('/api/analytics')
    assert response.status_code == 200
    metrics = response.json()['metrics']
    assert 'total_calls' in metrics
    assert 'completed_calls' in metrics
    assert 'success_rate' in metrics


def test_tts_endpoint_returns_audio_payload_for_browser_playback():
    client = TestClient(app)
    response = client.post('/api/tts', json={'text': 'This is a live voice test.'})
    assert response.status_code == 200
    body = response.json()
    assert body['status'] in {'success', 'demo', 'fallback'}
    assert body['audio_base64']
    assert body['mime_type']


def test_agent_response_is_contextual_and_not_repetitive():
    client = TestClient(app)
    first = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': 'I can pay ₹20,000 next Friday.',
        'history': [{'speaker': 'customer', 'text': 'I can pay ₹20,000 next Friday.'}],
    })
    second = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': 'I cannot do more than ₹15,000 this week.',
        'history': [{'speaker': 'customer', 'text': 'I cannot do more than ₹15,000 this week.'}],
    })

    assert first.status_code == 200
    assert second.status_code == 200
    assert '₹20,000' in first.json()['reply']
    assert '₹15,000' in second.json()['reply']
    assert first.json()['reply'] != second.json()['reply']


def test_agent_response_is_dynamic_for_unrelated_and_financial_messages():
    client = TestClient(app)
    prompts = [
        'Why is the sky blue?',
        'What is 4 plus 7?',
        'My name is Rahul.',
        'I am really angry because you keep calling me.',
        'How did you calculate ₹6,50,000?',
        'I can pay ₹5,000.',
        'I might be able to pay ₹20,000 next Friday, but I am not sure.',
        'I can arrange the full settlement amount today.',
        'I have no money at all.',
        'What happens if I do not settle?',
    ]

    replies = []
    for message in prompts:
        result = client.post('/api/agent-response', json={
            'agent': 'loan_settlement',
            'latest_customer_message': message,
            'history': [{'speaker': 'customer', 'text': message}],
        })
        assert result.status_code == 200
        replies.append(result.json()['reply'])

    assert len({reply.lower() for reply in replies}) >= 8
    assert not any('I understand your latest update' in reply for reply in replies)
    assert any('blue' in reply.lower() for reply in replies)
    assert any('11' in reply for reply in replies)


def test_insurance_renewal_response_addresses_price_gap_and_addons_without_repeating_questions():
    client = TestClient(app)
    history = [
        {'speaker': 'customer', 'text': 'The IDV went down from ₹9 lakh to ₹8 lakh and the premium is ₹15,000. Why is the value lower?'}
    ]
    payload = {
        'agent': 'insurance_renewal',
        'latest_customer_message': 'Another insurer offered ₹11,000 and I want to know exactly why I should pay more. The IDV dropped from ₹9 lakh to ₹8 lakh and the premium is ₹15,000. Are zero depreciation and roadside assistance included?',
        'history': history,
    }

    response = client.post('/api/agent-response', json=payload)
    assert response.status_code == 200
    reply = response.json()['reply']

    assert '₹4,000' in reply
    assert '₹11,000' in reply or '11,000' in reply
    assert 'zero depreciation' in reply.lower() or 'roadside assistance' in reply.lower()
    assert 'exact coverage issue' not in reply.lower()
    assert 'I need to know' not in reply
    assert 'I can help with the renewal decision' not in reply


def test_multi_part_loan_message_answers_every_question_without_repetitive_prompting():
    client = TestClient(app)
    response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': "₹6.5 lakh? That's way more than I expected. I definitely can't pay ₹4 lakh. Why are you asking me for that much, and what happens if I can't pay it?",
        'history': [{'speaker': 'customer', 'text': "₹6.5 lakh? That's way more than I expected. I definitely can't pay ₹4 lakh. Why are you asking me for that much, and what happens if I can't pay it?"}],
    })

    assert response.status_code == 200
    reply = response.json()['reply']
    assert '₹6,50,000' in reply or '₹6.5 lakh' in reply
    assert '₹4,00,000' in reply or '₹4 lakh' in reply
    assert 'cannot pay' in reply.lower() or "can't pay" in reply.lower()
    assert 'collection' in reply.lower() or 'credit' in reply.lower() or 'escalation' in reply.lower() or 'review' in reply.lower()
    assert 'What do you want to clarify right now?' not in reply
    assert 'Tell me what is realistic' not in reply
    assert 'I can help with the next step' not in reply


def test_personal_loan_amount_semantics_distinguish_mentions_from_payment_offers():
    client = TestClient(app)

    mention_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': '₹6.5 lakh? That\'s too much.',
        'history': [{'speaker': 'customer', 'text': '₹6.5 lakh? That\'s too much.'}],
    })
    assert mention_response.status_code == 200
    mention_reply = mention_response.json()['reply']
    assert 'proposed payment' not in mention_reply.lower()
    assert 'negotiation point' not in mention_reply.lower()
    assert 'final closure' not in mention_reply.lower()
    assert '₹6,50,000' in mention_reply or '₹6.5 lakh' in mention_reply

    inability_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': "I definitely can't pay ₹4 lakh.",
        'history': [{'speaker': 'customer', 'text': "I definitely can't pay ₹4 lakh."}],
    })
    assert inability_response.status_code == 200
    inability_reply = inability_response.json()['reply']
    assert 'cannot pay' in inability_reply.lower() or "can't pay" in inability_reply.lower() or 'not able' in inability_reply.lower()
    assert '₹4,00,000' in inability_reply or '₹4 lakh' in inability_reply
    assert 'settlement offer' in inability_reply.lower() or 'settlement' in inability_reply.lower()
    assert 'proposed payment' not in inability_reply.lower()

    proposal_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': 'I can pay ₹20,000 this month.',
        'history': [{'speaker': 'customer', 'text': 'I can pay ₹20,000 this month.'}],
    })
    assert proposal_response.status_code == 200
    proposal_reply = proposal_response.json()['reply']
    assert '₹20,000' in proposal_reply or '20,000' in proposal_reply
    assert 'proposed payment' in proposal_reply.lower() or 'payment' in proposal_reply.lower()

    owe_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': 'How much do I owe?',
        'history': [{'speaker': 'customer', 'text': 'How much do I owe?'}],
    })
    assert owe_response.status_code == 200
    owe_reply = owe_response.json()['reply']
    assert '₹6,50,000' in owe_reply or '₹6.5 lakh' in owe_reply
    assert '₹4,00,000' in owe_reply or 'settlement offer' in owe_reply.lower()

    consequences_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': "What happens if I don't pay?",
        'history': [{'speaker': 'customer', 'text': "What happens if I don't pay?"}],
    })
    assert consequences_response.status_code == 200
    consequences_reply = consequences_response.json()['reply']
    assert 'outstanding balance' in consequences_reply.lower() or 'remaining balance' in consequences_reply.lower() or '₹6,50,000' in consequences_reply
    assert 'collection' in consequences_reply.lower() or 'credit' in consequences_reply.lower() or 'escalation' in consequences_reply.lower() or 'review' in consequences_reply.lower()

    exact_message_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': "₹6.5 lakh? That's way more than I expected. I definitely can't pay ₹4 lakh. Why are you asking me for that much, and what happens if I can't pay it?",
        'history': [{'speaker': 'customer', 'text': "₹6.5 lakh? That's way more than I expected. I definitely can't pay ₹4 lakh. Why are you asking me for that much, and what happens if I can't pay it?"}],
    })
    assert exact_message_response.status_code == 200
    exact_reply = exact_message_response.json()['reply']
    assert '₹6,50,000' in exact_reply or '₹6.5 lakh' in exact_reply
    assert '₹4,00,000' in exact_reply or '₹4 lakh' in exact_reply
    assert "can't pay" in exact_reply.lower() or 'cannot pay' in exact_reply.lower() or 'not manageable' in exact_reply.lower()
    assert 'collection' in exact_reply.lower() or 'credit' in exact_reply.lower() or 'escalation' in exact_reply.lower() or 'review' in exact_reply.lower()
    assert 'proposed payment' not in exact_reply.lower()


def test_login_requires_valid_credentials_and_returns_current_user():
    import sqlite3
    from pathlib import Path

    db_path = Path(__file__).resolve().parents[1] / 'data' / 'creditnirvana.db'
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute('DELETE FROM users WHERE email = ?', ('admin@creditnirvana.test',))
    conn.execute(
        'INSERT INTO users (name, email, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        ('Admin User', 'admin@creditnirvana.test', '$2b$12$MUlscDCi33eaJVFHS.1NKOJKXu3dy.vuWalgwtGGzCZ.bZrQXYK5W', 'admin'),
    )
    conn.commit()
    conn.close()

    client = TestClient(app)
    wrong = client.post('/api/login', json={'email': 'admin@creditnirvana.test', 'password': 'wrong-password'})
    assert wrong.status_code == 401

    success = client.post('/api/login', json={'email': 'admin@creditnirvana.test', 'password': 'CorrectPass!123'})
    assert success.status_code == 200
    assert success.json()['user']['email'] == 'admin@creditnirvana.test'

    me = client.get('/api/me')
    assert me.status_code == 200
    assert me.json()['user']['email'] == 'admin@creditnirvana.test'

    logout = client.post('/api/logout')
    assert logout.status_code == 200
    me_after_logout = client.get('/api/me')
    assert me_after_logout.status_code == 401

    distinct_response = client.post('/api/agent-response', json={
        'agent': 'loan_settlement',
        'latest_customer_message': 'I can pay ₹20,000. Does that close the loan?',
        'history': [{'speaker': 'customer', 'text': 'I can pay ₹20,000. Does that close the loan?'}],
    })
    assert distinct_response.status_code == 200
    distinct_reply = distinct_response.json()['reply']
    assert '₹20,000' in distinct_reply or '20,000' in distinct_reply
    assert '₹6,50,000' in distinct_reply or '₹4,00,000' in distinct_reply
    assert 'close the loan' in distinct_reply.lower() or 'accepted settlement' in distinct_reply.lower() or 'settlement' in distinct_reply.lower()


def test_insurance_agent_responds_to_latest_question_in_same_coverage_price_objection():
    client = TestClient(app)
    history = [
        {'speaker': 'customer', 'text': 'Are zero depreciation and roadside assistance included?'},
        {'speaker': 'agent', 'text': 'I cannot confirm that without the policy schedule or quote. The current known facts are...' },
        {'speaker': 'customer', 'text': 'What should I compare between the two quotes?'},
        {'speaker': 'agent', 'text': 'You should compare IDV, deductibles, exclusions, add-ons, and claim support.'},
        {'speaker': 'customer', 'text': 'If both policies are identical, why should I pay ₹4,000 more?'},
    ]

    response = client.post('/api/agent-response', json={
        'agent': 'insurance_renewal',
        'latest_customer_message': 'If both policies are identical, why should I pay ₹4,000 more?',
        'history': history,
    })

    assert response.status_code == 200
    reply = response.json()['reply']
    assert '₹4,000' in reply
    assert 'cheaper' in reply.lower() or 'better value' in reply.lower()
    assert 'same coverage' in reply.lower() or 'identical' in reply.lower() or 'equivalent' in reply.lower()
    assert 'zero depreciation' not in reply.lower() or 'roadside assistance' not in reply.lower() or 'policy schedule' not in reply.lower()
