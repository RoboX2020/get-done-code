import * as https from 'https';

/** Contributions today (commits, PRs, issues, reviews) for the signed-in user, via GitHub GraphQL. */
export function contributionsToday(token: string, fromISO: string, toISO: string): Promise<number> {
  const body = JSON.stringify({
    query: 'query($from:DateTime!,$to:DateTime!){viewer{contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions}}}}',
    variables: { from: fromISO, to: toISO }
  });
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Authorization': `bearer ${token}`, 'User-Agent': 'get-done-code', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const n = j?.data?.viewer?.contributionsCollection?.contributionCalendar?.totalContributions;
          if (typeof n === 'number') resolve(n); else reject(new Error(j?.errors?.[0]?.message || 'Unexpected GitHub response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
