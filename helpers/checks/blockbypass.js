'use strict';

const { Bypass } = require(__dirname+'/../../db/')
	, { ObjectId } = require(__dirname+'/../../db/db.js')
	, { secureCookies, blockBypass } = require(__dirname+'/../../configs/main.js')
	, deleteTempFiles = require(__dirname+'/../files/deletetempfiles.js')
	, dynamicResponse = require(__dirname+'/../dynamic.js')
	, production = process.env.NODE_ENV === 'production';

module.exports = async (req, res, next) => {

	if (res.locals.preFetchedBypassId //if they already have a bypass
		|| (!blockBypass.enabled //or if block bypass isnt enabled
			&& (!blockBypass.forceAnonymizers //and we dont force it for anonymizers
			|| !res.locals.anonymizer))) { //or they arent an anonymizer
		return next();
	}

	//check if blockbypass exists and right length
	const bypassId = req.signedCookies.bypassid;
	if (!res.locals.solvedCaptcha && (!bypassId || bypassId.length !== 24)) {
		deleteTempFiles(req).catch(e => console.error);
		return dynamicResponse(req, res, 403, 'message', {
			'title': 'Forbidden',
			'message': 'Please complete a block bypass to continue',
			'frame': '/bypass_minimal.html',
			'link': {
				'href': '/bypass.html',
				'text': 'Get block bypass',
			},
		});
	}

	//try to get bypass from db and make sure uses < maxUses
	let bypass;
	if (bypassId && bypassId.length === 24) {
		try {
			const bypassMongoId = ObjectId(bypassId);
			bypass = await Bypass.checkBypass(bypassMongoId);
			res.locals.blockBypass = bypass;
		} catch (err) {
			return next(err);
		}
	}

	if (bypass //if they have a valid bypass
		&& (bypass.uses < blockBypass.expireAfterUses //and its not overused
			|| (res.locals.anonymizer && !blockBypass.forceAnonymizers))) { //OR its disabled for anonymizers, which ignores usage check
		return next();
	}

	if (res.locals.solvedCaptcha) {
		//they dont have a valid bypass, but just solved board captcha, so give them a new one
		const newBypass = await Bypass.getBypass();
		const newBypassId = newBypass.insertedId;
		res.locals.blockBypass = newBypass.ops[0];
		res.cookie('bypassid', newBypassId.toString(), {
			'maxAge': blockBypass.expireAfterTime,
			'secure': production && secureCookies && (req.headers['x-forwarded-proto'] === 'https'),
			'sameSite': 'strict',
			'signed': true
		});
		return next();
	}

	deleteTempFiles(req).catch(e => console.error);
	return dynamicResponse(req, res, 403, 'message', {
		'title': 'Forbidden',
		'message': 'Block bypass expired or exceeded max uses',
		'frame': '/bypass_minimal.html',
		'link': {
			'href': '/bypass.html',
			'text': 'Get block bypass',
		},
	});

}
