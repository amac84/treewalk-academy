import { Link } from 'react-router-dom'

const MUX_RTMP_SERVER = 'rtmp://global-live.mux.com:5222/app'
const OBS_DOWNLOAD = 'https://obsproject.com/'

export function AdminLivePresenterBroadcastGuidePage() {
  return (
    <section className="page page--admin">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Live events</p>
        <h1>Broadcast with OBS Studio</h1>
        <p className="page-subtitle">
          Live sessions use Mux over RTMP. Presenters install free OBS Studio once, then paste the stream key from{' '}
          <Link to="/admin/live-events">Live events</Link> for each session (or the shared rehearsal stream).
        </p>
      </header>

      <p className="muted" style={{ marginBottom: '1.25rem' }}>
        <Link to="/admin/live-events">← Back to Live events</Link>
      </p>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Step 1</p>
          <h2>Download and install OBS Studio</h2>
        </div>
        <p className="muted">
          OBS is the free, standard desktop encoder we support. It is not run inside the browser; presenters install it on
          Mac or Windows like any other app.
        </p>
        <ul className="stack-sm" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          <li>
            Download from the official site:{' '}
            <a href={OBS_DOWNLOAD} target="_blank" rel="noopener noreferrer">
              obsproject.com
            </a>
          </li>
          <li>Run the installer and accept the defaults unless your IT team specifies otherwise.</li>
          <li>On first launch, OBS may offer an auto-configuration wizard. You can run it or skip and follow the steps below.</li>
        </ul>
      </article>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Step 2</p>
          <h2>Connect OBS to Treewalk Academy (Mux)</h2>
        </div>
        <ol className="stack-sm" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          <li>In OBS, open <strong>Settings</strong> (or <strong>File → Settings</strong>).</li>
          <li>
            Go to <strong>Stream</strong>:
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              <li>
                <strong>Service:</strong> Custom
              </li>
              <li>
                <strong>Server:</strong>{' '}
                <code style={{ wordBreak: 'break-all' }}>{MUX_RTMP_SERVER}</code>
              </li>
              <li>
                <strong>Stream key:</strong> copy from <Link to="/admin/live-events">Admin → Live events</Link> — either
                the <strong>rehearsal</strong> stream key (practice) or the <strong>stream key</strong> on the scheduled
                occurrence card (real session). Treat it like a password.
              </li>
            </ul>
          </li>
          <li>Click <strong>Apply</strong>, then <strong>OK</strong>.</li>
        </ol>
      </article>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Step 3</p>
          <h2>Picture and sound</h2>
        </div>
        <ol className="stack-sm" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          <li>
            Under <strong>Settings → Video</strong>, set a sensible output resolution (for example 1280×720) and 30 FPS
            unless you need higher quality and bandwidth.
          </li>
          <li>
            In the main OBS window, under <strong>Sources</strong>, add:
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              <li>
                <strong>Video Capture Device</strong> for your webcam
              </li>
              <li>
                <strong>Audio Input Capture</strong> for your microphone (if it is not already included with the camera)
              </li>
              <li>
                <strong>Display Capture</strong> or <strong>Window Capture</strong> for slides or another app
              </li>
            </ul>
          </li>
          <li>Use the audio mixer meters to confirm mic levels before you go live.</li>
        </ol>
      </article>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Step 4</p>
          <h2>Go live and verify</h2>
        </div>
        <ol className="stack-sm" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          <li>
            Click <strong>Start Streaming</strong> in OBS. Wait a few seconds for the path to Mux to come up.
          </li>
          <li>
            For a <strong>scheduled occurrence</strong>, open <strong>Open learner live room</strong> from the same card on
            Live events (or share that URL with a test viewer). Use <strong>Refresh stream status</strong> if the player
            does not show video immediately.
          </li>
          <li>
            For the <strong>rehearsal</strong> stream only, there is no learner URL in the app; confirm video in the Mux
            dashboard for that live stream, or run a short test using a real occurrence as above.
          </li>
          <li>When finished, click <strong>Stop Streaming</strong> in OBS.</li>
        </ol>
      </article>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">If something fails</p>
          <h2>Quick checks</h2>
        </div>
        <ul className="stack-sm" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          <li>Server URL must match exactly (no trailing typo).</li>
          <li>Stream key must be copied in full with no extra spaces.</li>
          <li>Corporate networks sometimes block RTMP; try another network or ask IT to allow outbound RTMP.</li>
          <li>Stop and start streaming in OBS once, then refresh status in Live events.</li>
        </ul>
      </article>
    </section>
  )
}
