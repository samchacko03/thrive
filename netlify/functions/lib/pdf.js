/**
 * Render the report HTML page to a Letter PDF with headless Chromium (serverless build).
 * Returns a Buffer, or null if rendering is unavailable, so callers can fall back to the link.
 */
export async function renderPdf(url) {
  try {
    const [{ default: chromium }, puppeteer] = await Promise.all([import('@sparticuz/chromium'), import('puppeteer-core')]);
    const browser = await puppeteer.default.launch({
      args: chromium.args, defaultViewport: { width: 816, height: 1056 },
      executablePath: await chromium.executablePath(), headless: true
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally { await browser.close(); }
  } catch (err) {
    console.log(JSON.stringify({ t: new Date().toISOString(), pdf: 'skipped', error: String(err.message || err).slice(0, 120) }));
    return null;
  }
}
