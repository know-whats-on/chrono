const https = require('https');

const options = {
  hostname: 'kbkakrbxbvylwwiwkbfm.supabase.co',
  port: 443,
  path: '/functions/v1/make-server-d1909ddd/open-events',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtia2FrcmJ4YnZ5bHd3aXdrYmZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDA0NDMsImV4cCI6MjA4NjE3NjQ0M30.GdUWTi2vfnMXXLlkGLrare6gnid5f29DTZ4anM6_2Ms'
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => console.error(e));
req.end();
