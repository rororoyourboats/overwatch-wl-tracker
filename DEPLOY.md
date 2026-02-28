# Put This Tracker Online (Easiest Path)

## Recommended: Railway with PostgreSQL (persistent and safest)

1. Push this folder to GitHub.
2. In Railway, open your project.
3. Click `New` -> `Database` -> `PostgreSQL`.
4. Open your web service and make sure it has access to the Postgres service.
5. Railway will inject `DATABASE_URL` into the web service (if not, add it manually from Postgres `Connect` tab).
6. Redeploy the web service.

When `DATABASE_URL` is present, the app automatically uses PostgreSQL instead of file storage.

## Railway with Docker (also works)

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
