const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

const File = sequelize.define('File', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    reportOriginalName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    category: {
        type: DataTypes.STRING,
        allowNull: false
    },
    subcategory: {
        type: DataTypes.STRING,
        allowNull: false
    },
    malwarePath: {
        type: DataTypes.STRING,
        allowNull: false
    },
    reportPath: {
        type: DataTypes.STRING,
        allowNull: false
    }

}, {
    timestamps: true,
    tableName: 'files',
    indexes: [
        {
            fields: ['category']
        },
        {
            fields: ['subcategory']
        }
    ]

});



File.getCategoryStats = async function(category = null) {
    try {
        const where = category ? { category } : {};

        const files = await this.findAll({
            where,
            attributes: [
                'subcategory',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['subcategory'],
            order: [[sequelize.literal('count'), 'DESC']],
            raw: true
        });

        // Добавляем недостающие подкатегории с нулевым счетом
        const allSubcategories = ['Трояны', 'Вымогатели', 'Черви', 'Шпионы', 'Руткиты'];
         // Фильтруем только с данными
        return allSubcategories.map(sub => {
            const found = files.find(f => f.subcategory === sub);
            return {
                subcategory: sub,
                count: found ? parseInt(found.count) : 0
            };
        }).filter(item => item.count > 0);
    } catch (error) {
        console.error('Error getting stats:', error);
        return [];
    }
};
module.exports = { File };