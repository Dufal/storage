const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { File } = require('./models/File');
const { sequelize } = require('./models/db');

const app = express();
const PORT = 3000;

// --- 1. Инициализация базовых middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// --- 2. CORS middleware (должен быть одним из первых) ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// --- 3. OPTIONS для CORS ---

// Настройка загрузки файлов
const UPLOAD_DIR = path.join(__dirname, 'Uploads');
const MALWARE_DIR = path.join(UPLOAD_DIR, 'malware');
const REPORTS_DIR = path.join(UPLOAD_DIR, 'reports');

[UPLOAD_DIR, MALWARE_DIR, REPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
console.log('Upload directory exists:', fs.existsSync(UPLOAD_DIR));
console.log('Reports directory exists:', fs.existsSync(REPORTS_DIR));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = file.fieldname === 'malware' ? MALWARE_DIR : REPORTS_DIR;
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        if (file.fieldname === 'report') {
            cb(null, `${timestamp}-report.docx`);
        } else {
            const originalName = file.originalname;
            const safeName = originalName.replace(/[^\wа-яА-ЯёЁ\-.]/gi, '_');
            cb(null, `${timestamp}-${safeName}`);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'report') {
            if (!file.originalname.match(/\.docx$/i)) {
                return cb(new Error('Отчет должен быть в формате DOCX'));
            }
            if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                return cb(new Error('Файл отчета не является валидным DOCX'));
            }
        }
        if (file.fieldname === 'malware' && !file.originalname.match(/\.(zip|rar|7z)$/i)) {
            return cb(new Error('Архив должен быть в формате ZIP, RAR или 7Z'));
        }
        cb(null, true);
    }
});





// Загрузка файлов
app.post('/upload', upload.fields([
    { name: 'malware', maxCount: 1 },
    { name: 'report', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files?.malware || !req.files?.report) {
            throw new Error('Необходимо загрузить оба файла: архив и отчет');
        }

        const { category, subcategory } = req.body;

        if (!category || !subcategory) {
            throw new Error('Категория и подкатегория обязательны');
        }

        const malwareFile = req.files.malware[0];
        const reportFile = req.files.report[0];

        // Логирование для отладки
        console.log('Malware file size:', malwareFile.size);
        console.log('Report file size:', reportFile.size);
        console.log('Report file mime type:', reportFile.mimetype);

        // Проверка содержимого файла отчета
        const reportBuffer = fs.readFileSync(reportFile.path);
        console.log('Report file first 4 bytes:', reportBuffer.slice(0, 4).toString('hex')); // DOCX должен начинаться с PKZIP сигнатуры (504b0304)

        const newFile = await File.create({
            name: malwareFile.originalname,
            reportOriginalName: reportFile.originalname,
            category: category,
            subcategory: subcategory,
            malwarePath: malwareFile.path,
            reportPath: reportFile.path
        });

        res.json({
            success: true,
            file: newFile
        });
    } catch (error) {
        console.error('Upload error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});



// Скачивание файла
app.get('/download', async (req, res) => {
    try {
        const fileId = req.query.id;
        if (!fileId) throw new Error('Не указан ID файла');

        const fileRecord = await File.findByPk(fileId);
        if (!fileRecord) throw new Error('Файл не найден');

        if (!fs.existsSync(fileRecord.reportPath)) {
            throw new Error('Файл не найден на сервере');
        }

        res.download(fileRecord.reportPath, fileRecord.reportOriginalName);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Получение статистики
app.get('/stats', async (req, res) => {
    try {
        const { category } = req.query;
        let where = {};

        if (category && category !== 'all') {
            where.category = category;
        }

        const stats = await File.findAll({
            where,
            attributes: [
                'subcategory',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['subcategory'],
            order: [[sequelize.literal('count'), 'DESC']],
            raw: true
        });

        const allSubcategories = ['Трояны', 'Вымогатели', 'Черви', 'Шпионы', 'Руткиты'];
        const result = allSubcategories.map(sub => {
            const found = stats.find(f => f.subcategory === sub);
            return {
                subcategory: sub,
                count: found ? parseInt(found.count) : 0
            };
        });

        res.json({ success: true, stats: result });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статистики'
        });
    }
});

// Получение отчета
app.get('/report', async (req, res) => {
    try {
        const fileId = req.query.id;
        if (!fileId) {
            console.error('No file ID provided');
            return res.status(400).json({ success: false, error: 'Не указан ID файла' });
        }

        const fileRecord = await File.findByPk(fileId);
        if (!fileRecord) {
            console.error(`File with ID ${fileId} not found in database`);
            return res.status(404).json({ success: false, error: 'Файл не найден в базе данных' });
        }

        const reportPath = path.resolve(fileRecord.reportPath);
        console.log('Attempting to send file:', reportPath);
        if (!fs.existsSync(reportPath)) {
            console.error(`File not found at path: ${reportPath}`);
            return res.status(404).json({ success: false, error: 'Файл отчета не найден на сервере' });
        }

        // Проверка первых байтов файла
        const fileBuffer = fs.readFileSync(reportPath);
        const firstBytes = fileBuffer.slice(0, 4).toString('hex');
        console.log('Report file first 4 bytes:', firstBytes);
        if (firstBytes !== '504b0304') {
            console.error(`File at ${reportPath} is not a valid DOCX`);
            return res.status(400).json({ success: false, error: 'Файл не является валидным DOCX' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.reportOriginalName}"`);
        res.sendFile(reportPath, err => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ success: false, error: 'Ошибка при отправке файла' });
            }
        });
    } catch (error) {
        console.error('Error in /report:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера: ' + error.message });
    }
});

// --- 6. Удаление (исправленный вариант) ---
app.delete('/delete', async (req, res) => {
    try {
        const { id, part } = req.query;
        if (!id || !part) {
            return res.status(400).json({ error: 'Не указан ID или часть файла' });
        }

        const fileRecord = await File.findByPk(id);
        if (!fileRecord) {
            return res.status(404).json({ error: 'Файл не найден' });
        }

        // Удаление файлов
        if (part === 'malware' || part === 'all') {
            if (fileRecord.malwarePath && fs.existsSync(fileRecord.malwarePath)) {
                fs.unlinkSync(fileRecord.malwarePath);
            }
        }
        if (part === 'report' || part === 'all') {
            if (fileRecord.reportPath && fs.existsSync(fileRecord.reportPath)) {
                fs.unlinkSync(fileRecord.reportPath);
            }
        }

        // Обновление БД
        if (part === 'all') {
            await fileRecord.destroy();
        } else {
            if (part === 'malware') fileRecord.malwarePath = null;
            if (part === 'report') fileRecord.reportPath = null;
            await fileRecord.save();
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Дополнение файлов
app.post('/supplement', upload.single('file'), async (req, res) => {
    try {
        const { id, part } = req.query;
        if (!id || !part || !req.file) {
            return res.status(400).json({ success: false, error: 'Недостаточно данных' });
        }

        const fileRecord = await File.findByPk(id);
        if (!fileRecord) {
            return res.status(404).json({ success: false, error: 'Файл не найден' });
        }

        if (part === 'malware') {
            // Удаляем старый файл, если он есть
            if (fileRecord.malwarePath && fs.existsSync(fileRecord.malwarePath)) {
                fs.unlinkSync(fileRecord.malwarePath);
            }
            fileRecord.malwarePath = req.file.path;
            fileRecord.name = req.file.originalname;
        } else if (part === 'report') {
            // Удаляем старый файл, если он есть
            if (fileRecord.reportPath && fs.existsSync(fileRecord.reportPath)) {
                fs.unlinkSync(fileRecord.reportPath);
            }
            fileRecord.reportPath = req.file.path;
            fileRecord.reportOriginalName = req.file.originalname;
        }

        await fileRecord.save();

        res.json({ success: true, file: fileRecord });
    } catch (error) {
        console.error('Supplement error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/files', async (req, res) => {
    try {
        const { category, subcategory } = req.query;
        let where = {};

        if (category === 'all' && subcategory) {
            where.subcategory = subcategory;
        } else if (category === 'all') {
            // ВСЕ ФАЙЛЫ - без условий
        } else if (subcategory) {
            where.category = category;
            where.subcategory = subcategory;
        } else {
            where.category = category;
        }

        const files = await File.findAll({
            where: where,
            order: [['createdAt', 'DESC']],
            paranoid: false // Чтобы возвращались и "удаленные" записи (без одного из файлов)
        });

        res.json({
            success: true,
            files: files
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// --- 7. Запуск сервера ---
async function startServer() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        console.log('База данных подключена');
        app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
    } catch (error) {
        console.error('Ошибка запуска:', error);
        process.exit(1);
    }
}

startServer();