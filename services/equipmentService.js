/**
 * Equipment Service
 * Implements business operations for equipment catalogue search, details, and inventory management.
 */

const equipmentRepository = require('../repositories/equipmentRepository');
const userRepository = require('../repositories/userRepository');

class EquipmentService {
  async getCatalogue(filters) {
    return await equipmentRepository.find(filters);
  }

  async getEquipmentById(id) {
    const item = await equipmentRepository.findById(id);
    if (!item) return null;

    let owner = null;
    if (item.ownerId) {
      owner = await userRepository.findById(item.ownerId);
    }

    return {
      ...item,
      owner
    };
  }

  async getCategoryCounts(categories) {
    const counts = {};
    for (const cat of categories) {
      counts[cat] = await equipmentRepository.count({ category: cat });
    }
    counts['All'] = await equipmentRepository.count({});
    return counts;
  }

  async createEquipment(data, currentUser) {
    const ownerId = currentUser ? (currentUser.uid || currentUser.id || currentUser._id) : 'usr_default';
    const ownerName = currentUser ? currentUser.name : 'Campus Lab Store';

    return await equipmentRepository.create({
      ...data,
      ownerId,
      ownerName
    });
  }

  async updateEquipment(id, data) {
    return await equipmentRepository.update(id, data);
  }

  async deleteEquipment(id) {
    return await equipmentRepository.delete(id);
  }
}

module.exports = new EquipmentService();
