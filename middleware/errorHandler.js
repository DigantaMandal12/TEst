function notFoundHandler(req, res, next) {
  res.status(404).render('404', {
    pageTitle: 'Page Not Found',
    path: req.path
  });
}

function errorHandler(err, req, res, next) {
  console.error('[GLOBAL ERROR HANDLER]:', err);
  const status = err.status || 500;
  res.status(status).render('500', {
    pageTitle: 'Server Error',
    error: process.env.NODE_ENV === 'production' ? null : err,
    message: err.message || 'An unexpected campus exchange error occurred.'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
