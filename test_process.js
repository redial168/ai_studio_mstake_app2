import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/process-image',
  method: 'POST',
  headers: {
    'Content-Type': 'image/jpeg'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.end();
