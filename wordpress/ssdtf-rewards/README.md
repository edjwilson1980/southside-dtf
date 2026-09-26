# South Side Rewards (`ssdtf-rewards`)

Customer accounts, rewards points, My Account thumbnails, and 60-day gang sheet reorder.

## Install

1. Upload `ssdtf-rewards-1.0.0.zip` via **Plugins → Add New → Upload Plugin**, or copy `ssdtf-rewards/` into `wp-content/plugins/`.
2. Activate **South Side Rewards**.
3. Requires **South Side Gang Sheet Builder 1.22+** (Upload Gangsheet `_ssdtf_drive_file_id` / `_ssdtf_length_in` on order lines).
4. **WooCommerce → South Side Rewards → Settings**
   - Confirm relay URL (`https://southside-dtf.vercel.app`)
   - Leave relay secret blank to reuse the Gang Sheet Builder **Drive commit secret** (must match Vercel `SSGS_COMMIT_SECRET`)
5. Flush permalinks once (**Settings → Permalinks → Save**) so `/my-account/rewards/` works.
6. SiteGround: add a real cron every 15 minutes for `wp-cron.php` (see settings screen note).

## Features

- Points earn on completed orders; redeem via virtual coupon `ssdtf-points`
- File hold / archive / delete via Vercel `/api/files/*`
- Reorder on My Account (products 115 + 4365; never 2223)

## Tests

```bash
php wordpress/ssdtf-rewards/tests/test-points-math.php
```
