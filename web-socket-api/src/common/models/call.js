import {DataTypes} from 'sequelize';

const CallModel = {
	callID: {
		type: DataTypes.UUID,
		allowNull: false,
		unique: true,
		primaryKey: true,
	},
	totalDurationSecs: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
	},
	activeCall: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
	startedAt: {type: DataTypes.DATE, allowNull: true},
	finishedAt: {type: DataTypes.DATE, allowNull: true},
};

export default function defineCall(sequelize) {
	return sequelize.define('call', CallModel, {timestamps: false});
}
