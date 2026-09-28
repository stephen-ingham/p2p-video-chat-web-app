import {Router} from 'express';
import {check} from '../common/middlewares/is-authenticated.js';
import {iceServersRateLimit} from '../common/middlewares/rate-limits.js';
import * as CallController from './controller.js';

const router = new Router();

router.get(
	'/ice-servers',
	check,
	iceServersRateLimit,
	CallController.getIceServers,
);
router.post('/create', check, CallController.createCall);
router.put('/:callID/join', check, CallController.joinCall);
router.delete('/:callID/leave', check, CallController.leaveCall);
router.post('/:callID/messages', check, CallController.sendMessage);

export default router;
