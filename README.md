# hyperxstore

Build a professional dark-themed key distribution website with deep purple accents using React + Supabase. NO localStorage for critical data — everything in Supabase.

## USER FLOW (single user-facing page only)

- Website opens → login page shows immediately

- User enters LOGIN CODE (set by admin, e.g. "Hypeee1973")

- System generates HWID (device fingerprint)

- System checks: has this HWID already claimed a key from THIS login code batch?

   - YES → show the SAME key again (not a new one)

   - NO → assign next available NON-EXPIRED key from this batch, save claim, show key

- User can login unlimited times, always sees SAME key for SAME login code

- When admin changes login code to a NEW code, same HWID can claim ONE new key from new batch

- If no valid keys left in batch → show "No keys available, contact admin"

- After key is revealed, show:

   - The key in a glowing purple card with COPY button

   - Key expiry date (e.g. "Expires on: 12 Dec 2025")

   - Discord invite link button below the key

   - HWID shown small (masked)

## KEY RULES

- 1 HWID = 1 key PER LOGIN CODE BATCH

- Same batch → same key (locked)

- New login code = new batch = new key allowed for same HWID

- Keys can expire. Expired keys cannot be claimed. Already-claimed-but-expired keys still show to their owner (marked "Expired")

- Unclaimed keys left in a batch stay available until used OR expired — admin can end a batch anytime by just changing the login code

## HWID

- Generate using FingerprintJS or custom canvas+UA+screen+fonts hash

- Stored in Supabase, never localStorage

## ADMIN PANEL (hidden route /admin, Supabase email+password auth)

### 1. Login Code Manager

- Set current active login code

- View history of all past codes with date created

- Activate/deactivate batches

### 2. Key Manager

- Add keys: single or bulk paste (one per line)

- Assign keys to current login code batch automatically

- Set expiry date when adding (single date for whole batch OR per key)

- Search box: search by key value or HWID

- Filters: status (available / claimed / expired / revoked), login_code batch, date range

- Table columns: key_value, batch, status, claimed_by_hwid (masked), claimed_at, expires_at

- Actions per key: delete, revoke, reset to available, extend expiry

- Bulk actions: select multiple → delete / revoke / extend expiry

### 3. Claims Log

- Table: HWID, key_value, login_code batch, claimed_at, expires_at

- Search + filter by HWID / batch / date

### 4. Settings

- Discord invite link (URL) — editable, shown to users after key reveal

- Logout

## DATABASE SCHEMA (Supabase)

**settings**

- id (uuid, single row)

- current_login_code (text)

- discord_invite_url (text)

- updated_at (timestamp)

**login_codes**

- id (uuid)

- code (text, unique)

- is_active (boolean)

- created_at (timestamp)

**keys**

- id (uuid)

- key_value (text, unique)

- login_code (text, FK → login_codes.code)

- status (text: 'available' | 'claimed' | 'expired' | 'revoked')

- expires_at (timestamp, nullable — null = never expires)

- claimed_by_hwid (text, nullable)

- claimed_at (timestamp, nullable)

- created_at (timestamp)

**claims**

- id (uuid)

- hwid (text)

- key_id (uuid, FK)

- login_code (text)

- created_at (timestamp)

- UNIQUE (hwid, login_code)   ← CORE RULE

## CORE LOGIC (Supabase RPC / Edge Function — server-side, security definer)

Function: `claim_key(p_login_code text, p_hwid text)`

1. Verify p_login_code = settings.current_login_code

2. Look up claims WHERE hwid=p_hwid AND login_code=p_login_code

   - If found → return that key (even if expired, mark it "expired")

3. Else:

   - SELECT one key WHERE login_code=p_login_code AND status='available'

     AND (expires_at IS NULL OR expires_at > now())

     ORDER BY created_at ASC LIMIT 1 FOR UPDATE

   - If none → return error "no_keys"

   - UPDATE key: status='claimed', claimed_by_hwid=p_hwid, claimed_at=now()

   - INSERT into claims (hwid, key_id, login_code)

   - Return key + expires_at

4. RLS: keys table NOT readable from client directly, only via RPC

5. Rate-limit claim attempts per HWID/IP (max 10 per minute)

## DESIGN

- Dark background (#0a0612 with purple tint)

- Deep purple accents (#6d28d9, #7c3aed, #a855f7)

- Glowing purple buttons & borders

- Font: Inter or Space Grotesk

- Glassmorphism cards, smooth animations

- Fully mobile responsive

- Discord button styled with Discord blurple but blended nicely with purple theme

- Only ONE user-facing page (login → key reveal)

## SEED

- Create admin account

- Set default login code = "Hypeee1973"

- Set default Discord invite link = "https://discord.gg/yourinvite"

- Add a few test keys with sample expiry dates

Deliver in one clean build. Prioritize security, no localStorage, uniqueness of (hwid, login_code), and admin search/filter power.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a1352a84-c918-41d2-8aba-008c306776d8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
