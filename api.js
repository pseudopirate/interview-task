const express = require('express')
const hubspot = require('@hubspot/api-client')
const { getDoc, setDoc, doc } = require('firebase/firestore');
const db = require('./db');



const router = express.Router()



function isExpired(tokens) {
    return tokens.expires < Date.now();
}

router.use(async (req, res, next) => {
    const tokensResp = await getDoc(doc(db, 'tokens', req.sessionID));
    const tokens = tokensResp.data();
    const hubspotClient = new hubspot.Client()

    if (isExpired(tokens)) {
        const newTokens = await hubspotClient.oauth.tokensApi
            .createToken(
                'refresh_token',
                undefined,
                undefined,
                process.env.CLIENT_ID,
                process.env.CLIENT_SECRET,
                tokens.refreshToken
            );

            hubspotClient.setAccessToken(newTokens.accessToken);
        await setDoc(doc(db, 'tokens', req.sessionID), {
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expires: Date.now() + newTokens.expiresIn + 1000,
            tokenType: newTokens.tokenType,
        });
    } else {
        hubspotClient.setAccessToken(tokens.accessToken);
    }

    req.hubspot = hubspotClient;
    next();
});

router.get('/contacts', async (req, res) => {
    const allContacts = await req.hubspot.crm.contacts.getAll();
    const contacts = allContacts.map(({id, properties}) => ({
        id,
        name: `${properties.firstname} ${properties.lastname}`,
        email: properties.email
    }))
    ;

    res.json(contacts)
})

router.get('/contacts/:id', async (req, res) => {
    const {id, properties: {firstname, lastname, email}, associations} = await req.hubspot.crm.contacts.basicApi.getById(
        req.params.id,
        undefined,
        undefined,
        ['notes']
        );

    let notes = [];

    if (associations && associations.notes) {
        const BatchReadInputSimplePublicObjectId = {
            properties: ["hs_note_body"],
    
            inputs: associations.notes.results
        };
    
        const notesResp = await req.hubspot.crm.objects.notes.batchApi.read(BatchReadInputSimplePublicObjectId);
        notes = notesResp.results.map(({id, properties: {hs_note_body}}) => ({
            id,
            body: hs_note_body,
        }))
    }

    const contact = {
        id,
        firstname,
        lastname,
        email,
        notes
    }
    res.json(contact)
})

module.exports = router
