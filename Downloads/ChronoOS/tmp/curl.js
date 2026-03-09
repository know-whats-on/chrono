const https = require('https');

const req = https.request('https://kbkakrbxbvylwwiwkbfm.supabase.co/functions/v1/make-server-d1909ddd/open-events', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('HTTP', res.statusCode, '\n', data.slice(0, 1000)));
});
req.on('error', console.error);
req.end();
