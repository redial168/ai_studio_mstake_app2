import https from 'https';

const options = {
  hostname: 'api.textin.com',
  path: '/ai/service/v1/handwritten_erase',
  method: 'POST',
  headers: {
    'x-ti-app-id': 'test',
    'x-ti-secret-code': 'test',
    'Content-Type': 'application/octet-stream',
    'Content-Length': 0
  }
};

const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
