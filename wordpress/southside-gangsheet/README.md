# South Side Gang Sheet — WordPress plugin

Embed the customer builder and send finished sheets to the WooCommerce cart.

## Install

1. Zip this folder and upload via **Plugins → Add New → Upload Plugin** → Activate.
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: your **Build A Gangsheet** variable product ID
3. Add shortcode on the product/page:

```
[southside_gangsheet]
```

4. On Vercel, set `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` (all environments) and redeploy.

## How cart handoff works

1. Customer builds inside the iframe and clicks **Add to Cart** (only shown when embedded).
2. The builder `postMessage`s the PNG + payload to this plugin (no cross-origin API calls).
3. The plugin stores the file, picks the sheet-length variation, adds the WooCommerce cart line, then redirects to the cart.
