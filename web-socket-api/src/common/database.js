import process from 'node:process';
import {Sequelize} from 'sequelize';

// On Cloud Run, DB_HOST is the Cloud SQL connector's Unix socket
// (/cloudsql/<connection name>), which mysql2 takes as socketPath, not host.
const isSocket = process.env.DB_HOST?.startsWith('/');

const sequelize = new Sequelize(
	process.env.DB_NAME,
	process.env.DB_USER ?? 'root',
	process.env.DB_PASSWORD,
	{
		...(isSocket
			? {dialectOptions: {socketPath: process.env.DB_HOST}}
			: {host: process.env.DB_HOST, port: process.env.DB_PORT || 3306}),
		dialect: 'mysql',
		logging: true,
	},
);

export default sequelize;
