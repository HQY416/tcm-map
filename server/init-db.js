const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data', 'herbmap.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('已连接到SQLite数据库');
        initTables();
    }
});

function initTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'editor',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS herbs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            alias TEXT,
            origin TEXT,
            nature TEXT,
            meridian TEXT,
            efficacy TEXT,
            indication TEXT,
            usage TEXT,
            contraindication TEXT,
            image_url TEXT,
            creator_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            file_path TEXT NOT NULL,
            file_name TEXT,
            duration INTEGER,
            thumbnail TEXT,
            uploader_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploader_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS herb_video_relation (
            herb_id INTEGER NOT NULL,
            video_id INTEGER NOT NULL,
            PRIMARY KEY (herb_id, video_id),
            FOREIGN KEY (herb_id) REFERENCES herbs(id),
            FOREIGN KEY (video_id) REFERENCES videos(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            ingredients TEXT,
            efficacy TEXT,
            creator_id INTEGER,
            is_published INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS herb_recipe_relation (
            herb_id INTEGER NOT NULL,
            recipe_id INTEGER NOT NULL,
            PRIMARY KEY (herb_id, recipe_id),
            FOREIGN KEY (herb_id) REFERENCES herbs(id),
            FOREIGN KEY (recipe_id) REFERENCES recipes(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS search_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            herb_id INTEGER,
            keywords TEXT,
            content TEXT,
            FOREIGN KEY (herb_id) REFERENCES herbs(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            herb_id TEXT NOT NULL,
            nickname TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_herb_id ON comments(herb_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_herb_created ON comments(herb_id, created_at DESC)`);

        db.run(`CREATE TABLE IF NOT EXISTS herb_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            herb_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (herb_id) REFERENCES herbs(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_herb_images_herb_id ON herb_images(herb_id)`);

        db.run(`CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_type TEXT NOT NULL,
            page_id TEXT,
            visitor_id TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            referer TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(target_type, target_id, visitor_id)
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_likes_created_at ON likes(created_at DESC)`);

        db.run(`CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            contact TEXT,
            screenshot TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS feedback_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feedback_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (feedback_id) REFERENCES feedback(id),
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            detail TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        const salt = bcrypt.genSaltSync(10);
        const adminPassword = bcrypt.hashSync('admin123', salt);
        const editorPassword = bcrypt.hashSync('editor123', salt);
        
        db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES 
            ('admin', ?, 'admin'),
            ('editor', ?, 'editor')`, 
            [adminPassword, editorPassword], (err) => {
            if (!err) {
                console.log('默认用户已初始化 (admin/admin123, editor/editor123)');
            }
            insertSampleData();
        });
    });
}

function insertSampleData() {
    const sampleHerbs = [
        { name: '五指毛桃', alias: '鸡矢藤、土黄芪', origin: '河源市', nature: '甘、平', meridian: '脾、胃、肺', efficacy: '健脾补肺，行气利湿，舒筋活络', indication: '脾虚浮肿，食少无力，肺痨咳嗽，盗汗', creator_id: 1 },
        { name: '灵芝', alias: '灵芝草、仙草', origin: '河源市', nature: '甘、平', meridian: '心、肺、肝、肾', efficacy: '补气安神，止咳平喘', indication: '眩晕不眠，心悸气短，虚劳咳喘', creator_id: 1 },
        { name: '金线莲', alias: '金线兰、鸟人参', origin: '河源市', nature: '甘、凉', meridian: '肺、肝、肾、膀胱', efficacy: '清热凉血，祛风利湿，强心利尿', indication: '肾炎，膀胱炎，糖尿病，支气管炎', creator_id: 1 },
        { name: '巴戟天', alias: '鸡肠风、鸡眼藤', origin: '肇庆市德庆', nature: '甘、辛、微温', meridian: '肾、肝', efficacy: '补肾阳，强筋骨，祛风湿', indication: '阳痿遗精，宫冷不孕，月经不调', creator_id: 1 },
        { name: '何首乌', alias: '首乌、地精', origin: '肇庆市德庆', nature: '苦、甘、涩、温', meridian: '肝、心、肾', efficacy: '补益精血，乌须发，强筋骨', indication: '血虚萎黄，眩晕耳鸣，须发早白', creator_id: 1 },
        { name: '石斛', alias: '黄草、吊兰', origin: '肇庆市', nature: '甘、微寒', meridian: '胃、肾', efficacy: '益胃生津，滋阴清热', indication: '阴伤津亏，口干烦渴，食少干呕', creator_id: 1 },
        { name: '广陈皮', alias: '陈皮、橘皮', origin: '江门市新会', nature: '苦、辛、温', meridian: '肺、脾', efficacy: '理气健脾，燥湿化痰', indication: '胸脘胀满，食少吐泻，咳嗽痰多', creator_id: 1 },
        { name: '新会柑', alias: '柑果', origin: '江门市新会', nature: '甘、酸、平', meridian: '肺、胃', efficacy: '生津止渴，醒酒利尿', indication: '热病烦渴，小便不利，饮酒过度', creator_id: 1 },
        { name: '化橘红', alias: '化州橘红、柚皮橘红', origin: '茂名市化州', nature: '辛、苦、温', meridian: '肺、脾', efficacy: '散寒，燥湿，利气，消痰', indication: '风寒咳嗽，喉痒痰多，食积伤酒', creator_id: 1 },
        { name: '沉香(茂名)', alias: '沉水香、女儿香', origin: '茂名市', nature: '辛、苦、微温', meridian: '脾、胃、肾', efficacy: '行气止痛，温中止呕，纳气平喘', indication: '胸腹胀闷疼痛，胃寒呕吐呃逆', creator_id: 1 },
        { name: '春砂仁', alias: '阳春砂、缩砂蜜', origin: '阳江市阳春', nature: '辛、温', meridian: '脾、胃、肾', efficacy: '化湿开胃，温脾止泻，理气安胎', indication: '湿浊中阻，脘痞不饥，脾胃虚寒', creator_id: 1 },
        { name: '梅片', alias: '梅花冰片、龙脑香', origin: '梅州市', nature: '辛、苦、凉', meridian: '心、脾、肺', efficacy: '开窍醒神，清热止痛', indication: '热病神昏，痉厥，中风痰厥', creator_id: 1 },
        { name: '木棉花', alias: '英雄花、攀枝花', origin: '广州市', nature: '甘、淡、凉', meridian: '大肠', efficacy: '清热，利湿，解毒，止血', indication: '泄泻，痢疾，血崩，疮毒', creator_id: 1 },
        { name: '鸡蛋花', alias: '缅栀子、蛋黄花', origin: '广州市', nature: '甘、凉', meridian: '肺、大肠', efficacy: '清热，利湿，解暑', indication: '感冒发热，肺热咳嗽，湿热黄疸', creator_id: 1 },
        { name: '玉竹', alias: '荧、委萎', origin: '清远市', nature: '甘、平', meridian: '肺、胃', efficacy: '养阴润燥，生津止渴', indication: '肺胃阴伤，燥热咳嗽，咽干口渴', creator_id: 1 },
        { name: '百合', alias: '白百合、蒜脑薯', origin: '清远市', nature: '甘、寒', meridian: '心、肺', efficacy: '养阴润肺，清心安神', indication: '阴虚久咳，痰中带血，虚烦惊悸', creator_id: 1 },
        { name: '溪黄草', alias: '熊胆草、山熊胆', origin: '韶关市', nature: '苦、寒', meridian: '肝、胆、大肠', efficacy: '清热利湿，凉血散瘀', indication: '急性黄疸型肝炎，急性胆囊炎', creator_id: 1 },
        { name: '绞股蓝', alias: '七叶胆、南方人参', origin: '韶关市', nature: '苦、微甘、凉', meridian: '肺、脾、肾', efficacy: '清热，补虚，解毒', indication: '体虚乏力，虚劳失精，高脂血症', creator_id: 1 },
        { name: '莞香', alias: '女儿香', origin: '东莞市', nature: '辛、苦、微温', meridian: '脾、胃、肾', efficacy: '行气止痛，温中止呕', indication: '胸腹胀闷疼痛，胃寒呕吐', creator_id: 1 },
        { name: '陈皮', alias: '广陈皮', origin: '佛山市', nature: '苦、辛、温', meridian: '肺、脾', efficacy: '理气健脾，燥湿化痰', indication: '脾胃气滞，脘腹胀满，食少吐泻', creator_id: 1 },
        { name: '白花蛇舌草', alias: '蛇舌草', origin: '惠州市', nature: '甘、淡、凉', meridian: '胃、大肠、小肠', efficacy: '清热解毒，利尿通淋', indication: '痈肿疮毒，咽喉肿痛，毒蛇咬伤', creator_id: 1 },
        { name: '鱼腥草', alias: '蕺菜、臭菜', origin: '惠州市', nature: '辛、微寒', meridian: '肺', efficacy: '清热解毒，消痈排脓', indication: '肺痈吐脓，痰热喘咳，热痢热淋', creator_id: 1 },
        { name: '金钱白花蛇', alias: '白花蛇', origin: '揭阳市', nature: '甘、咸、温', meridian: '肝、脾', efficacy: '祛风，通络，止痉', indication: '风湿顽痹，麻木拘挛，中风半身不遂', creator_id: 1 },
        { name: '橄榄', alias: '青果、忠果', origin: '汕头市', nature: '甘、酸、平', meridian: '肺、胃', efficacy: '清热，利咽，生津，解毒', indication: '咽喉肿痛，咳嗽烦渴，鱼蟹中毒', creator_id: 1 },
        { name: '余甘子', alias: '庵摩勒、油甘子', origin: '汕头市', nature: '甘、酸、涩、凉', meridian: '肺、胃', efficacy: '清热凉血，消食健胃，生津止咳', indication: '血热血瘀，消化不良，腹胀', creator_id: 1 },
        { name: '橘红', alias: '潮州橘红', origin: '潮州市', nature: '辛、苦、温', meridian: '肺、脾', efficacy: '理气宽中，燥湿化痰', indication: '咳嗽痰多，食积伤酒，呕恶痞闷', creator_id: 1 },
        { name: '佛手', alias: '佛手柑、五指橘', origin: '潮州市', nature: '辛、苦、酸、温', meridian: '肝、脾、肺', efficacy: '疏肝理气，和胃止痛', indication: '肝胃气滞，胸胁胀痛，食少呕吐', creator_id: 1 },
        { name: '菠萝蜜', alias: '木菠萝', origin: '湛江市', nature: '甘、微酸、平', meridian: '胃', efficacy: '生津除烦，解酒醒脾', indication: '酒精中毒，酒后烦渴，消化不良', creator_id: 1 },
        { name: '高良姜', alias: '风姜、小良姜', origin: '湛江市徐闻', nature: '辛、热', meridian: '脾、胃', efficacy: '温胃散寒，消食止痛', indication: '脘腹冷痛，胃寒呕吐，嗳气吞酸', creator_id: 1 },
        { name: '海马', alias: '水马、马头鱼', origin: '汕尾市', nature: '甘、温', meridian: '肝、肾', efficacy: '温肾壮阳，散结消肿', indication: '阳痿，遗尿，肾虚作喘', creator_id: 1 },
        { name: '鲍鱼', alias: '鳆鱼、镜面鱼', origin: '汕尾市', nature: '甘、咸、平', meridian: '肝、肾', efficacy: '滋阴清热，益精明目', indication: '阴虚内热，骨蒸劳热，青盲内障', creator_id: 1 },
        { name: '杏仁', alias: '苦杏仁、北杏仁', origin: '中山市', nature: '苦、微温', meridian: '肺、大肠', efficacy: '降气止咳平喘，润肠通便', indication: '咳嗽气喘，胸满痰多，肠燥便秘', creator_id: 1 },
        { name: '土茯苓', alias: '冷饭团、硬饭头', origin: '中山市', nature: '甘、淡、平', meridian: '肝、胃', efficacy: '解毒，除湿，通利关节', indication: '湿热淋浊，带下，痈肿，瘰疬', creator_id: 1 },
        { name: '五指毛桃(梅州)', alias: '鸡矢藤', origin: '梅州市', nature: '甘、平', meridian: '脾、胃、肺', efficacy: '健脾补肺，行气利湿', indication: '脾虚浮肿，食少无力，肺痨咳嗽', creator_id: 1 }
    ];

    db.get('SELECT COUNT(*) as cnt FROM herbs', (err, row) => {
        if (row && row.cnt === 0) {
            const stmt = db.prepare(`INSERT OR IGNORE INTO herbs 
                (name, alias, origin, nature, meridian, efficacy, indication, creator_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            sampleHerbs.forEach(h => stmt.run(h.name, h.alias, h.origin, h.nature, h.meridian, h.efficacy, h.indication, h.creator_id));
            stmt.finalize(() => {
                console.log('示例药材数据已插入');
                rebuildSearchIndex();
            });
        } else {
            console.log('药材数据已存在, 跳过初始化');
        }
    });

    const sampleRecipes = [
        { title: '五指毛桃煲鸡汤', content: '<p><strong>材料：</strong>五指毛桃50g，鸡一只，瘦肉200g<br><strong>做法：</strong>材料洗净后放入汤锅，加水适量，大火烧开后转小火煲2小时调味即可。</p>', ingredients: JSON.stringify(['五指毛桃50g', '土鸡1只', '瘦肉200g', '姜片3片', '蜜枣2粒']), efficacy: '健脾祛湿，益气补虚', creator_id: 1, is_published: 1, herb_ids: [1, 13] },
        { title: '广陈皮普洱茶', content: '<p><strong>材料：</strong>广陈皮一瓣，普洱茶适量<br><strong>做法：</strong>陈皮冲洗后加入开水洗茶一遍，第二泡即可饮用。</p>', ingredients: JSON.stringify(['广陈皮一瓣', '普洱茶5克', '开水']), efficacy: '理气健脾，燥湿化痰', creator_id: 1, is_published: 1, herb_ids: [7, 21] },
        { title: '灵芝乌鸡汤', content: '<p><strong>材料：</strong>灵芝15g，乌鸡半只，红枣6粒，枸杞10g<br><strong>做法：</strong>乌鸡焯水，灵芝切片，所有材料放入炖盅，加水隔水炖3小时，加盐调味。</p>', ingredients: JSON.stringify(['灵芝15g', '乌鸡半只', '红枣6粒', '枸杞10g', '姜片2片']), efficacy: '补气安神，养血益精', creator_id: 1, is_published: 1, herb_ids: [2] },
        { title: '化橘红雪梨汤', content: '<p><strong>材料：</strong>化橘红5g，雪梨1个，冰糖适量<br><strong>做法：</strong>雪梨去皮切块，化橘红洗净，加水煮30分钟，加入冰糖调味。</p>', ingredients: JSON.stringify(['化橘红5g', '雪梨1个', '冰糖适量']), efficacy: '润肺止咳，化痰平喘', creator_id: 1, is_published: 1, herb_ids: [9] },
        { title: '春砂仁鲫鱼汤', content: '<p><strong>材料：</strong>春砂仁5g，鲫鱼1条，生姜3片<br><strong>做法：</strong>鲫鱼煎至两面金黄，加水煮开，放入春砂仁和姜片，小火煲1小时。</p>', ingredients: JSON.stringify(['春砂仁5g', '鲫鱼1条', '生姜3片', '陈皮少许']), efficacy: '化湿开胃，温脾止泻', creator_id: 1, is_published: 1, herb_ids: [11] },
        { title: '木棉花祛湿粥', content: '<p><strong>材料：</strong>干木棉花20g，薏米30g，扁豆30g，大米100g<br><strong>做法：</strong>木棉花洗净煎水去渣，用药汁与薏米、扁豆、大米同煮成粥。</p>', ingredients: JSON.stringify(['干木棉花20g', '薏米30g', '扁豆30g', '大米100g']), efficacy: '清热利湿，健脾祛湿', creator_id: 1, is_published: 1, herb_ids: [14] }
    ];

    db.get('SELECT COUNT(*) as cnt FROM recipes', (err, row) => {
        if (row && row.cnt === 0) {
            const recipeStmt = db.prepare(`INSERT OR IGNORE INTO recipes 
                (title, content, ingredients, efficacy, creator_id, is_published) 
                VALUES (?, ?, ?, ?, ?, ?)`);
            sampleRecipes.forEach(r => recipeStmt.run(r.title, r.content, r.ingredients, r.efficacy, r.creator_id, r.is_published));
            recipeStmt.finalize(() => {
                console.log('示例食谱数据已插入');
                db.get('SELECT COUNT(*) as cnt FROM herb_recipe_relation', (err2, row2) => {
                    if (row2 && row2.cnt === 0) {
                        db.all('SELECT id, title FROM recipes', [], (err3, recipes) => {
                            if (err3 || !recipes) return;
                            const titleToId = {};
                            recipes.forEach(r => { titleToId[r.title] = r.id; });
                            const relStmt = db.prepare('INSERT OR IGNORE INTO herb_recipe_relation (herb_id, recipe_id) VALUES (?, ?)');
                            sampleRecipes.forEach(sr => {
                                if (sr.herb_ids && titleToId[sr.title]) {
                                    sr.herb_ids.forEach(hid => relStmt.run(hid, titleToId[sr.title]));
                                }
                            });
                            relStmt.finalize(() => console.log('食谱-药材关联已建立'));
                        });
                    }
                });
            });
        } else {
            console.log('食谱数据已存在, 跳过初始化');
        }
    });
}

function rebuildSearchIndex() {
    db.all('SELECT id, name, alias, origin, nature, efficacy FROM herbs', (err, herbs) => {
        if (err || !herbs || herbs.length === 0) return;
        let pending = herbs.length;
        herbs.forEach(h => {
            const keywords = `${h.name} ${h.alias || ''} ${h.origin} ${h.nature} ${h.efficacy}`;
            db.run('INSERT OR IGNORE INTO search_index (herb_id, keywords, content) VALUES (?, ?, ?)', 
                [h.id, keywords, JSON.stringify(h)], () => {
                    if (--pending === 0) console.log('搜索索引已建立');
                });
        });
    });
}

module.exports = db;
