# Text Scrap API

This API extracts **visible text** from a web page using Puppeteer (with stealth plugin) and detects potential anti-bot mechanisms like **CAPTCHAs** and **Cloudflare protections**.

Session-related files (cookies, raw HTML, screenshot) are saved automatically in the `session_info/` folder.

---

## 🔧 Endpoint

**POST** `/scrape`

### Request Body (JSON)
```json
{
  "url": "https://example.com",
  "force": true,                  // optional
  "saveName": "my_file.txt"       // optional
}
```
## Exemple using curl 
```bash
   curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```