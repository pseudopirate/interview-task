require('dotenv').config();

const express = require('express');
const session = require('express-session');
const hubspot = require('@hubspot/api-client')
const { collection, getDocs, setDoc, doc } = require('firebase/firestore');
const db = require('./db');

const app = express();

const api = require('./api');
const PORT = 3000;


if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    throw new Error('Missing CLIENT_ID or CLIENT_SECRET environment variable.')
}

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GRANT_TYPES = {
  AUTHORIZATION_CODE: 'authorization_code',
  REFRESH_TOKEN: 'refresh_token',
};


let SCOPES = [];
if (process.env.SCOPE) {
    SCOPES = (process.env.SCOPE.split(',')).join(' ');
}

const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;


app.use(session({
  secret: Math.random().toString(36).substring(2),
  resave: false,
  saveUninitialized: true
}));

app.use('/api', api)

app.use('/install', async (req, res) => {
  const hubspotClient = new hubspot.Client();
  const installUrl = hubspotClient.oauth.getAuthorizationUrl(
    CLIENT_ID,
    REDIRECT_URI,
    SCOPES
  );

  res.redirect(installUrl);
});

app.get('/oauth-callback', async (req, res) => {
  const hubspotClient = new hubspot.Client();

  const tokenResponse = await hubspotClient.oauth.tokensApi.createToken(
    GRANT_TYPES.AUTHORIZATION_CODE,
    req.query.code,
    REDIRECT_URI,
    CLIENT_ID,
    CLIENT_SECRET
  );

  // !!!!! Insecure, tokens requires encription before persisting it in a database !!!!!
  await setDoc(doc(db, 'tokens', req.sessionID), {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expires: Date.now() + tokenResponse.expiresIn + 1000,
    tokenType: tokenResponse.tokenType,
  });

  res.redirect(`/`);
});


app.get('/', async (req, res) => {
  res.send('ok')
});

app.get('/error', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.write(`<h4>Error: ${req.query.msg}</h4>`);
  res.end();
});

app.use('/db', async (req, res) => {
    const querysnapshot = await getDocs(collection(db, 'tokens'));
    const data = querysnapshot.docs.map(doc => doc.data());
    res.json(data)
})



app.listen(PORT, () => console.log(`Starting your app on ${PORT}`));
