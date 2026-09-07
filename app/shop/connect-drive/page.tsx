'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Copy, HardDrive } from 'lucide-react'

const PARENT_FOLDER_ID = '1Ju6W6SSQR8KJXrTfK-bcARJUyCEKpA5E'

export default function ConnectDrivePage() {
  const params = useSearchParams()
  const connected = params.get('connected') === '1'
  const refreshToken = params.get('refresh') || ''
  const error = params.get('error') || ''
  const [copied, setCopied] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)

  async function copyToken() {
    if (!refreshToken) return
    await navigator.clipboard.writeText(refreshToken)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  async function verifyWrite() {
    setVerifyBusy(true)
    setVerifyMsg(null)
    try {
      const res = await fetch('/api/drive/verify', { method: 'POST' })
      const json = (await res.json()) as { error?: string; folderUrl?: string; mode?: string }
      if (!res.ok) throw new Error(json.error || 'Drive check failed.')
      setVerifyMsg(`Connected (${json.mode}). Test folder: ${json.folderUrl}`)
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Drive check failed.')
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <main className="cutter-test">
      <nav className="shop-nav" aria-label="Shop tools">
        <a className="shop-nav-link" href="/shop">
          Shop builder
        </a>
        <a className="shop-nav-link" href="/shop/cutter-test">
          Cutter test
        </a>
        <a className="shop-nav-link" href="/">
          Customer builder
        </a>
      </nav>

      <h1>
        <HardDrive size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
        Connect Google Drive
      </h1>
      <p className="lede">
        Personal Gmail accounts do not have Shared drives. Sign in once with the shop Google account so pre-cut customer
        jobs can upload into <strong>Gang sheet uploads</strong>.
      </p>

      <ol className="steps">
        <li>
          Open Google Cloud Console → <strong>APIs &amp; Services</strong> → <strong>Credentials</strong> →{' '}
          <strong>Create credentials</strong> → <strong>OAuth client ID</strong> (Web application).
        </li>
        <li>
          Add this authorized redirect URI (use your real site URL in production):
          <br />
          <code>http://localhost:3000/api/drive/oauth/callback</code>
          <br />
          <code>https://YOUR_VERCEL_DOMAIN/api/drive/oauth/callback</code>
        </li>
        <li>
          Save these on the host (Vercel env or <code>.env.local</code>):
          <br />
          <code>GOOGLE_DRIVE_OAUTH_CLIENT_ID</code>
          <br />
          <code>GOOGLE_DRIVE_OAUTH_CLIENT_SECRET</code>
          <br />
          <code>GOOGLE_DRIVE_PARENT_FOLDER_ID={PARENT_FOLDER_ID}</code>
        </li>
        <li>Click Connect below, choose the shop Gmail, and allow Drive access.</li>
        <li>
          Copy the refresh token into <code>GOOGLE_DRIVE_REFRESH_TOKEN</code>, restart/redeploy, then Verify.
        </li>
      </ol>

      {error ? <p className="error">Google sign-in error: {error}</p> : null}

      <p className="primary">
        <a className="shop-nav-link" href="/api/drive/oauth/start">
          Connect Google Drive
        </a>
      </p>

      {connected ? (
        <section className="variants">
          <section>
            <h2>
              <Check size={18} style={{ display: 'inline', marginRight: 6 }} />
              Signed in — copy this refresh token
            </h2>
            <p>
              Add it as <code>GOOGLE_DRIVE_REFRESH_TOKEN</code> in Vercel / <code>.env.local</code>, then redeploy or
              restart.
            </p>
            <textarea
              readOnly
              value={refreshToken}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            />
            <p className="primary">
              <button type="button" onClick={() => void copyToken()} disabled={!refreshToken}>
                {copied ? (
                  'Copied'
                ) : (
                  <>
                    <Copy size={16} style={{ display: 'inline', marginRight: 6 }} />
                    Copy refresh token
                  </>
                )}
              </button>
            </p>
          </section>
        </section>
      ) : null}

      <section className="variants">
        <section>
          <h2>Verify uploads</h2>
          <p className="watch">
            After the env vars are set, this creates a tiny test folder inside Gang sheet uploads. If Google says storage
            is full, free space on the shop Gmail Drive first.
          </p>
          <button type="button" disabled={verifyBusy} onClick={() => void verifyWrite()}>
            {verifyBusy ? 'Checking…' : 'Test Drive write access'}
          </button>
          {verifyMsg ? <p className={verifyMsg.startsWith('Connected') ? 'watch' : 'error'}>{verifyMsg}</p> : null}
        </section>
      </section>
    </main>
  )
}
