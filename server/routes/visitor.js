const express = require('express');
const router = express.Router();
const { issueVisitorId, verifyVisitorId } = require('../middleware/auth');

// 签发访客标识:客户端首次访问时调用,获取带 HMAC 签名的 visitor_id
// 若请求已带有效签名 visitor_id,原样返回;否则生成新的
router.post('/issue', function(req, res) {
    const incoming = req.headers['x-visitor-id'] || req.query.visitor_id || req.body.visitor_id;
    const verified = verifyVisitorId(incoming);
    const signed = issueVisitorId(verified || null);
    res.json({ success: true, data: { visitor_id: signed } });
});

router.get('/issue', function(req, res) {
    const incoming = req.headers['x-visitor-id'] || req.query.visitor_id;
    const verified = verifyVisitorId(incoming);
    const signed = issueVisitorId(verified || null);
    res.json({ success: true, data: { visitor_id: signed } });
});

module.exports = router;
