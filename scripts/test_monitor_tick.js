const http = require('http');

const payload = JSON.stringify({
  image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lICYtLS0tLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKABJQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAFAQIDBAYAB//EADwQAAEDAgQDBgQEBwAAAAAAAAEAAgMEEQUSITFBUWEGEyJxgZGhscHR8BQjQlJy0fAjcoOSkqL/xAAZAQADAQEBAAAAAAAAAAAAAAABAgMABAX/xAAkEQACAgICAQQDAAAAAAAAAAAAAQIRAwQSITETQSIyQVEyQv/aAAwDAQACEQMRAD8A9zREQEREBERAEREBERAEREBERAEREBERAEREBERAEREBERAEREBERAEREBERAEREH//Z"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/v1/sdk/sessions/de5431d3-d171-44cb-9df9-47b2ad6ff07f/ai/monitor-tick?persist=1',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-API-Key': 'psk_live_dev-demo-university-local-only'
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', res.headers);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error('ERROR:', e.message);
});

req.write(payload);
req.end();
