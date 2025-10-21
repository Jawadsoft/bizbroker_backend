const { ManagementClient } = require('auth0');

const auth0Management = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  scope: 'read:users create:users update:users delete:users'
});

module.exports = auth0Management;