from __future__ import annotations

AGENT_META = {
    "loan_settlement": {
        "name": "Personal Loan Settlement Agent",
        "objective": "Secure a realistic repayment or settlement commitment.",
        "compliance_note": "Do not threaten legal action or invent lender authorization.",
        "figures": {
            "original_loan": 500000,
            "total_outstanding": 650000,
            "proposed_settlement": 400000,
        },
    },
    "insurance_renewal": {
        "name": "Maruti Brezza Insurance Renewal Agent",
        "objective": "Present suitable renewal coverage and secure a decision.",
        "compliance_note": "Clearly label demo quotes and never claim a policy is issued without a real authorized workflow.",
        "figures": {
            "vehicle": "Maruti Brezza",
            "previous_idv": 900000,
            "proposed_idv": 800000,
            "standard_premium": 20000,
            "discounted_premium": 15000,
            "saving": 5000,
            "discount_percent": 25,
            "idv_difference": 100000,
        },
    },
}


def get_agent_prompt(agent_key: str) -> str:
    meta = AGENT_META.get(agent_key, AGENT_META["loan_settlement"])
    return (
        f"Agent: {meta['name']}\n"
        f"Objective: {meta['objective']}\n"
        f"Compliance: {meta['compliance_note']}\n"
    )
