# South Side Gang Sheet — WordPress plugin

Embed the customer builder (`https://southside-dtf.vercel.app`) on [southsidedtf.com](https://southsidedtf.com) (or any WordPress / WooCommerce site).

## Install

1. Zip this folder as `southside-gangsheet.zip` (must contain `southside-gangsheet.php` at the zip root, or zip the folder itself).
2. In WordPress: **Plugins → Add New → Upload Plugin** → choose the zip → **Activate**.
3. **Settings → Gang Sheet Builder** — confirm Builder URL is `https://southside-dtf.vercel.app`.
4. Edit your **Build A Gangsheet** product (or any page) and add a Shortcode block:

```
[southside_gangsheet]
```

Optional:

```
[southside_gangsheet height="2600" title="Build a Gang Sheet"]
```

5. Publish and view the page. The builder loads in an iframe (`/embed`). Pre-cut jobs still upload PNG + PLT to Google Drive.

## Notes

- Only embed the **customer** builder. Do not embed `/shop`.
- The Next.js app allows framing from `southsidedtf.com` and `sspdtf.com` by default. Other domains: set `EMBED_FRAME_ANCESTORS` on Vercel (space-separated list including `'self'`).
- Customers can use **Open full page** / **Open in a new tab** if the iframe feels tight on mobile.
