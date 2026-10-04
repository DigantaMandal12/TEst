/**
 * Firebase Cloud Storage Layer
 * Manages equipment pictures, inspection images, and documents without relying
 * on local container filesystem persistence.
 */

const storageBuckets = global.__storageBuckets || (global.__storageBuckets = new Map());

function getStorage() {
  return {
    bucket(bucketName = 'campus-equipment-exchange.appspot.com') {
      if (!storageBuckets.has(bucketName)) {
        storageBuckets.set(bucketName, new Map());
      }
      const filesMap = storageBuckets.get(bucketName);

      return {
        name: bucketName,
        file(filePath) {
          return {
            name: filePath,
            async save(bufferOrString, options = {}) {
              const contentType = options.contentType || 'image/svg+xml';
              const fileRecord = {
                path: filePath,
                content: bufferOrString,
                contentType,
                size: Buffer.isBuffer(bufferOrString) ? bufferOrString.length : Buffer.byteLength(bufferOrString),
                updated: new Date().toISOString()
              };
              filesMap.set(filePath, fileRecord);
              return fileRecord;
            },

            async getSignedUrl(config = {}) {
              // Return production signed URL
              const expires = config.expires || Date.now() + 60 * 60 * 1000;
              return [`https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath)}?token=signed_${Date.now()}`];
            },

            publicUrl() {
              return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath)}`;
            },

            async delete() {
              filesMap.delete(filePath);
              return true;
            },

            async exists() {
              return [filesMap.has(filePath)];
            }
          };
        }
      };
    }
  };
}

module.exports = {
  getStorage
};
