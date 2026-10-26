from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bcrypt

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from backend.app.database import create_user, get_user_by_email, init_db
else:
    from backend.app.database import create_user, get_user_by_email, init_db


def main() -> None:
    parser = argparse.ArgumentParser(description='Create the first CreditNirvana admin user.')
    parser.add_argument('--name', default='Admin User', help='Full name for the account.')
    parser.add_argument('--email', default='admin@creditnirvana.test', help='Email address for the user.')
    parser.add_argument('--password', required=True, help='Password for the first user account.')
    parser.add_argument('--role', default='admin', help='Role for the account.')
    args = parser.parse_args()

    init_db()
    existing = get_user_by_email(args.email)
    if existing:
        print(f'User already exists for {args.email}.')
        return

    password_hash = bcrypt.hashpw(args.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = create_user(args.name, args.email, password_hash, args.role)
    print(f'Created user: {user["name"]} <{user["email"]}>')
    print('Use this command to sign in from the app:')
    print(f'  Email: {user["email"]}')
    print('  Password: the value you passed to --password')


if __name__ == '__main__':
    main()
