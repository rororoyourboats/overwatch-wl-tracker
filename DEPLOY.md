# Put This Tracker Online (Easiest Path)

## Recommended: Railway with Docker (easiest)

1. Push this folder to a GitHub repo.
2. Create a Railway account and click `New Project` -> `Deploy from GitHub repo`.
3. Select this repo.
4. Railway will detect the `Dockerfile` automatically.
5. Add a persistent volume and mount it to `/app/data`.
   - This is required so `data/matches.json` survives restarts/redeploys.
6. In service variables, set:
   - `DATA_DIR=/app/data`
7. Deploy.
8. Open the generated Railway URL.

## Local run

```powershell
cd C:\Users\ranMo\Overwatch
npm install
npm start
```

Open `http://localhost:3000`.

## Notes

- Match entry time is automatically saved as `createdAt` and shown in the Match Log.
- If you deploy without a persistent volume, your data can reset after redeploys.
