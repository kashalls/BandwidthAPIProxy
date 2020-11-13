const { Server, Messaging, Notifications, MongoDB } = require('../config');

const validE164Number = /^\+[1-9]\d{10,14}$/;

const { MongoClient } = require('mongodb');
const Mongo = new MongoClient(`mongodb+srv://kashall:${MongoDB.Password}@bandwidth.wawds.mongodb.net/bandwidth?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true });
Mongo.connect().then(() => console.log('Mongo has successfully connected')).catch((err) => console.error(err));

const fetch = require('node-fetch');

const express = require('express');
const app = express();
app.use(express.json());

const BandwidthMessaging = require('@bandwidth/messaging');
const BandwidthController = BandwidthMessaging.APIController;
BandwidthMessaging.Configuration.basicAuthUserName = Messaging.APIToken;
BandwidthMessaging.Configuration.basicAuthPassword = Messaging.APIKey;

app.use((req, res, next) => {
	res.removeHeader('X-Powered-By');
	res.setHeader('X-Powered-By', 'Your Love and Compassion');
	res.setHeader('X-Made-With-Love', 'https://github.com/Kashalls');
	next();
});

app.get('/', (req, res) => res.send('No patrick, mayonnaise is not an instrument.'));
app.post('/callback', async (req, res) => {
	// All message callbacks are sent as a list/array [{ }] to your application's webhook url.
	const payload = req.body[0];
	console.log(`DEBUG 1:: ${JSON.stringify(payload)}`);
	console.log(`DEBUG 2:: ${JSON.stringify(req.headers)}`);

	const exists = await Mongo.db('bandwidth').collection('messages').findOne({ 'message.id': payload.message.id }).toArray();
	console.log(exists);
	if (exists.filter((obj) => obj.message.id === payload.message.id).length >= 1) return res.status(200).json({ message: 'Already recieved this message, thanks...' });
	console.log(`Debug Condition 2.1 `);
	// Authenticated Webhooks
	if (!req.headers.authorization) {
		console.log(`Debug Condition 3:: ${req.headers.authorization}`);
		return res.setHeader('WWW-Authenticate', 'Basic realm="Access to this webhook"').status(401).json({ error: 'Challenge needed' });
	}

	if (req.headers.authorization) {
		const AuthorizationFrom = Buffer.from(req.headers.authorization.split(' ')[1], 'base64');
		const Authorization = AuthorizationFrom.toString('utf-8');
		const [Username, Token] = Authorization.split(':');
		if (Username !== Server.AuthenticatedCallbacks.Credentials.Username || Token !== Server.AuthenticatedCallbacks.Credentials.Password) return res.status(401).json({ error: 'Invalid credentials' });
		res.status(204).send();
	}
	// Bandwidth Callbacks require us to respond with a 2xx Status Code for EVERY callback receipt,
	// or else it will re-queue it for sending again. This includes if we already received and proccessed,
	// a callback.
	// We have 10 seconds to respond so lets just get it out of the way immediately.
	res.status(204);

	Mongo
		.db('bandwidth')
		.collection('messages')
		.insertOne(payload)
		.then((result) => {
			console.log(result);
		})
		.catch((err) => console.error(err));

	if (Notifications.Discord) {
		const body = {
			embeds: [
				{
					title: payload.description.toUpperCase(),
					fields: [{
						name: 'From',
						value: payload.message.from,
						inline: true
					}, {
						name: 'To',
						value: payload.to,
						inline: true
					}, {
						name: 'Message',
						value: payload.message.text
					}, {
						name: 'Message ID',
						value: payload.message.id
					}]
				}
			]
		};

		return fetch(Notifications.Discord, {
			method: 'post',
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' }
		});
	}

/* if (payload.type === 'message-delivered') {

	} */
});

app.post('/bandwidth/outgoing', async (req, res) => {
	if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });
	const payload = req.body;
	if (!payload.text) return res.status(422).json({ error: 'Text property is either invalid or not present.' });
	if (!payload.to || !validE164Number.test(payload.to)) {
		return res.status(422).json({ error: 'To property is either not in a valid E.164 format or not present.' });
	}

	const message = new BandwidthMessaging.MessageRequest({
		applicationId: Messaging.ApplicationID,
		to: Array.isArray(payload.to) ? [...payload.to] : payload.to,
		from: Messaging.PhoneNumber,
		text: payload.text
	});
	await BandwidthController.createMessage(Messaging.AccountID, message, (error, response) => {
		if (error) return res.status(error.errorCode).send(error);
		else return res.status(200).send(response);
	});
});

app.listen(Server.Port, () => console.log('Started listening on 3000'));
