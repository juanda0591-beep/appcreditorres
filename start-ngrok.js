const { spawn } = require('child_process');
const path = require('path');

const ngrokPath = path.join(__dirname, 'ngrok.exe');
const ngrok = spawn(ngrokPath, ['http', '3000']);

ngrok.stdout.on('data', (data) => {
  console.log(data.toString());
});

ngrok.stderr.on('data', (data) => {
  console.error(data.toString());
});

ngrok.on('error', (error) => {
  console.error('Error:', error.message);
});

console.log('Starting ngrok on port 3000...');
console.log('Press Ctrl+C to stop');
