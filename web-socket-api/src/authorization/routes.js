import {Router} from 'express';
import {check} from '../common/middlewares/is-authenticated.js';
import {signupRateLimit} from '../common/middlewares/rate-limits.js';
import * as AuthController from './controller.js';

const router = new Router();

router.post('/signup', signupRateLimit, AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', check, AuthController.logout);
router.post('/refresh', check, AuthController.refresh);

export default router;
