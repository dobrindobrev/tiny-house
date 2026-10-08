import { defineConfig } from 'vite';
import fs from 'node:fs';

// HTTPS with a locally-generated (mkcert) certificate so the microphone
// works on iPad Safari — iOS only exposes getUserMedia on origins whose
// certificate chain is TRUSTED, not merely accepted at the warning screen.
// Generate with: mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem <mac-ip> localhost
// and copy "$(mkcert -CAROOT)/rootCA.pem" into public/.
// One-time iPad setup: download https://<mac-ip>:5173/rootCA.pem, install
// the profile (Settings > Profile Downloaded), then enable it under
// Settings > General > About > Certificate Trust Settings.
// Without the certs the dev server falls back to plain HTTP.
const hasCerts = fs.existsSync('.cert/key.pem') && fs.existsSync('.cert/cert.pem');

export default defineConfig({
  server: {
    https: hasCerts
      ? {
          key: fs.readFileSync('.cert/key.pem'),
          cert: fs.readFileSync('.cert/cert.pem'),
        }
      : undefined,
  },
});
