# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.08.zip`](./southside-gangsheet-1.08.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.08.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (or leave `0` for slug `custom-gang-sheet-builder`)
   - Pre-cut product ID: builder path (per-transfer custom price)
   - Upload product ID: customer-uploaded sheets (leave `0` to reuse main product)
   - Upload pre-cut product ID: variable product with the **same size attributes** as the upload sheet; catalogue price by size
3. Shortcodes:

```
[southside_gangsheet]
[southside_gangsheet mode="upload"]
```

4. Keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` on Vercel.

## Pricing notes

- **Builder** sheets: pre-cut is a custom-priced line from `precutTotal` (per transfer).
- **Upload** sheets: pre-cut is a second catalogue line matched by billable length — detection never sets the price.
