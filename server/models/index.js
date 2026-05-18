const db = require('../init-db');

const User = {
    findByUsername: (username, callback) => {
        db.get('SELECT * FROM users WHERE username = ?', [username], callback);
    },
    findById: (id, callback) => {
        db.get('SELECT id, username, role, created_at FROM users WHERE id = ?', [id], callback);
    }
};

const Herb = {
    findAll: (callback) => {
        db.all('SELECT h.*, u.username as creator_name FROM herbs h LEFT JOIN users u ON h.creator_id = u.id ORDER BY h.created_at DESC', callback);
    },
    findById: (id, callback) => {
        db.get('SELECT h.*, u.username as creator_name FROM herbs h LEFT JOIN users u ON h.creator_id = u.id WHERE h.id = ?', [id], callback);
    },
    searchByKeyword: (likePattern, rawKeyword, callback) => {
        const sql = `
            SELECT h.* FROM herbs h
            LEFT JOIN search_index si ON si.herb_id = h.id
            WHERE h.name LIKE ? ESCAPE '\\'
               OR h.alias LIKE ? ESCAPE '\\'
               OR h.origin LIKE ? ESCAPE '\\'
               OR h.nature LIKE ? ESCAPE '\\'
               OR h.efficacy LIKE ? ESCAPE '\\'
               OR h.indication LIKE ? ESCAPE '\\'
               OR si.keywords LIKE ? ESCAPE '\\'
            GROUP BY h.id
            ORDER BY 
                CASE WHEN h.name LIKE ? ESCAPE '\\' THEN 0
                     WHEN h.alias LIKE ? ESCAPE '\\' THEN 1
                     ELSE 2
                END,
                h.id
            LIMIT 30
        `;
        const params = [likePattern, likePattern, likePattern, likePattern, likePattern, likePattern, likePattern, likePattern, likePattern];
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('DB search error:', err);
                return callback(err, []);
            }
            if (rows && rows.length > 0) {
                return callback(null, rows);
            }
            db.all('SELECT * FROM herbs', [], (err2, allHerbs) => {
                if (err2 || !allHerbs) return callback(null, []);
                try {
                    const Fuse = require('fuse.js');
                    const fuse = new Fuse(allHerbs, {
                        keys: ['name', 'alias', 'origin', 'nature', 'efficacy', 'indication'],
                        threshold: 0.4,
                        includeScore: true
                    });
                    const fuseResults = fuse.search(rawKeyword);
                    callback(null, fuseResults.map(r => r.item).slice(0, 20));
                } catch (e) {
                    callback(null, []);
                }
            });
        });
    },
    create: (data, callback) => {
        const { name, alias, origin, nature, meridian, efficacy, indication, image_url, creator_id } = data;
        db.run(`INSERT INTO herbs (name, alias, origin, nature, meridian, efficacy, indication, image_url, creator_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, alias, origin, nature, meridian, efficacy, indication, image_url || null, creator_id], function(err) {
                if (!err) {
                    const keywords = `${name} ${alias || ''} ${origin} ${nature} ${efficacy}`;
                    db.run('INSERT OR IGNORE INTO search_index (herb_id, keywords) VALUES (?, ?)', [this.lastID, keywords]);
                }
                callback(err, this);
            });
    },
    update: (id, data, callback) => {
        const { name, alias, origin, nature, meridian, efficacy, indication, image_url } = data;
        db.run(`UPDATE herbs SET name=?, alias=?, origin=?, nature=?, meridian=?, efficacy=?, indication=?, image_url=? 
                WHERE id = ?`,
            [name, alias, origin, nature, meridian, efficacy, indication, image_url || null, id], (err) => {
                if (!err) {
                    const keywords = `${name} ${alias || ''} ${origin} ${nature} ${efficacy}`;
                    db.run('UPDATE search_index SET keywords = ? WHERE herb_id = ?', [keywords, id]);
                }
                callback(err);
            });
    },
    delete: (id, callback) => {
        db.run('DELETE FROM search_index WHERE herb_id = ?', [id], () => {
            db.run('DELETE FROM herb_images WHERE herb_id = ?', [id], () => {
                db.run('DELETE FROM herbs WHERE id = ?', [id], callback);
            });
        });
    }
};

const Video = {
    findAll: (callback) => {
        db.all('SELECT v.*, u.username as uploader_name FROM videos v LEFT JOIN users u ON v.uploader_id = u.id ORDER BY v.created_at DESC', callback);
    },
    findById: (id, callback) => {
        db.get('SELECT v.*, u.username as uploader_name FROM videos v LEFT JOIN users u ON v.uploader_id = u.id WHERE v.id = ?', [id], callback);
    },
    findByHerbId: (herbId, callback) => {
        db.all(`SELECT v.* FROM videos v 
                JOIN herb_video_relation r ON v.id = r.video_id 
                WHERE r.herb_id = ?`, [herbId], callback);
    },
    create: (data, callback) => {
        const { title, description, file_path, file_name, thumbnail, uploader_id } = data;
        db.run(`INSERT INTO videos (title, description, file_path, file_name, thumbnail, uploader_id) 
                VALUES (?, ?, ?, ?, ?, ?)`,
            [title, description, file_path, file_name, thumbnail, uploader_id], callback);
    },
    update: (id, data, callback) => {
        const { title, description } = data;
        db.run('UPDATE videos SET title=?, description=? WHERE id = ?', [title, description, id], callback);
    },
    relateToHerb: (herbId, videoId, callback) => {
        db.run('INSERT OR IGNORE INTO herb_video_relation (herb_id, video_id) VALUES (?, ?)', [herbId, videoId], callback);
    },
    unrelateHerb: (herbId, videoId, callback) => {
        db.run('DELETE FROM herb_video_relation WHERE herb_id = ? AND video_id = ?', [herbId, videoId], callback);
    },
    getRelatedHerbNames: (videoId, callback) => {
        db.all(`SELECT h.id, h.name FROM herbs h JOIN herb_video_relation r ON h.id = r.herb_id WHERE r.video_id = ?`, [videoId], callback);
    },
    delete: (id, callback) => {
        db.run('DELETE FROM herb_video_relation WHERE video_id = ?', [id], () => {
            db.run('DELETE FROM videos WHERE id = ?', [id], callback);
        });
    }
};

const Recipe = {
    findAll: (onlyPublished = false, callback) => {
        let sql = 'SELECT r.*, u.username as creator_name FROM recipes r LEFT JOIN users u ON r.creator_id = u.id';
        const params = [];
        if (onlyPublished) {
            sql += ' WHERE r.is_published = 1';
        }
        sql += ' ORDER BY r.updated_at DESC';
        db.all(sql, params, callback);
    },
    findById: (id, callback) => {
        db.get('SELECT r.*, u.username as creator_name FROM recipes r LEFT JOIN users u ON r.creator_id = u.id WHERE r.id = ?', [id], callback);
    },
    findByHerbId: (herbId, callback) => {
        db.all(`SELECT r.*, u.username as creator_name FROM recipes r
                JOIN herb_recipe_relation hr ON r.id = hr.recipe_id
                LEFT JOIN users u ON r.creator_id = u.id
                WHERE hr.herb_id = ? AND r.is_published = 1
                ORDER BY r.updated_at DESC`, [herbId], callback);
    },
    create: (data, callback) => {
        const { title, content, ingredients, efficacy, is_published, creator_id } = data;
        db.run(`INSERT INTO recipes (title, content, ingredients, efficacy, is_published, creator_id) 
                VALUES (?, ?, ?, ?, ?, ?)`,
            [title, content, ingredients, efficacy, is_published ? 1 : 0, creator_id], callback);
    },
    update: (id, data, callback) => {
        const { title, content, ingredients, efficacy, is_published } = data;
        db.run(`UPDATE recipes SET title=?, content=?, ingredients=?, efficacy=?, is_published=?, updated_at=CURRENT_TIMESTAMP 
                WHERE id = ?`,
            [title, content, ingredients, efficacy, is_published ? 1 : 0, id], callback);
    },
    relateToHerb: (herbId, recipeId, callback) => {
        db.run('INSERT OR IGNORE INTO herb_recipe_relation (herb_id, recipe_id) VALUES (?, ?)', [herbId, recipeId], callback);
    },
    unrelateHerb: (herbId, recipeId, callback) => {
        db.run('DELETE FROM herb_recipe_relation WHERE herb_id = ? AND recipe_id = ?', [herbId, recipeId], callback);
    },
    getRelatedHerbNames: (recipeId, callback) => {
        db.all(`SELECT h.id, h.name FROM herbs h JOIN herb_recipe_relation hr ON h.id = hr.herb_id WHERE hr.recipe_id = ?`, [recipeId], callback);
    },
    delete: (id, callback) => {
        db.run('DELETE FROM herb_recipe_relation WHERE recipe_id = ?', [id], () => {
            db.run('DELETE FROM recipes WHERE id = ?', [id], callback);
        });
    }
};

const HerbImage = {
    findByHerbId: (herbId, callback) => {
        db.all('SELECT * FROM herb_images WHERE herb_id = ? ORDER BY sort_order ASC, id ASC', [herbId], callback);
    },
    add: (herbId, imageUrl, sortOrder, callback) => {
        db.run('INSERT INTO herb_images (herb_id, image_url, sort_order) VALUES (?, ?, ?)',
            [herbId, imageUrl, sortOrder || 0], callback);
    },
    delete: (imageId, callback) => {
        db.run('DELETE FROM herb_images WHERE id = ?', [imageId], callback);
    },
    deleteByHerbId: (herbId, callback) => {
        db.run('DELETE FROM herb_images WHERE herb_id = ?', [herbId], callback);
    },
    countByHerbId: (herbId, callback) => {
        db.get('SELECT COUNT(*) as count FROM herb_images WHERE herb_id = ?', [herbId], callback);
    },
    updateSortOrder: (imageId, sortOrder, callback) => {
        db.run('UPDATE herb_images SET sort_order = ? WHERE id = ?', [sortOrder, imageId], callback);
    }
};

module.exports = { User, Herb, Video, Recipe, HerbImage };
