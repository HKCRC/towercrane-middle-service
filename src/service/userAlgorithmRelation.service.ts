import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { PrismaService } from '@/providers/prisma';
import { v4 as uuidv4 } from 'uuid';

@Provide()
@Scope(ScopeEnum.Request, { allowDowngrade: true })
export class UserAlgorithmRelationService {
  async createRelation(userID: string, algorithmID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.create({
        data: {
          user_id: userID,
          algorithm_id: algorithmID,
          relation_id: uuidv4(),
        },
      });
      return result;
    } catch (error) {
      console.error('Error creating relation:', error);
      throw new Error('Failed to create relation');
    }
  }

  async getRelationByUserId(userID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.findMany({
        where: {
          user_id: userID,
        },
      });
      return result;
    } catch (error) {
      console.error('Error getting relation by user ID:', error);
      throw new Error('Failed to get relation by user ID');
    }
  }

  async getRelationByAlgorithmId(algorithmID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.findMany({
        where: {
          algorithm_id: algorithmID,
        },
      });
      return result;
    } catch (error) {
      console.error('Error getting relation by algorithm ID:', error);
      throw new Error('Failed to get relation by algorithm ID');
    }
  }

  async updateRelation(
    relationID: string,
    data: { user_id?: string; algorithm_id?: string }
  ) {
    try {
      const result = await PrismaService.algorithmUserRelation.update({
        where: {
          relation_id: relationID,
        },
        data,
      });
      return result;
    } catch (error) {
      console.error('Error updating relation:', error);
      throw new Error('Failed to update relation');
    }
  }

  async deleteRelation(relationID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.delete({
        where: {
          relation_id: relationID,
        },
      });
      return result;
    } catch (error) {
      console.error('Error deleting relation:', error);
      throw new Error('Failed to delete relation');
    }
  }

  async deleteRelationByUserId(userID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.deleteMany({
        where: {
          user_id: userID,
        },
      });
      return result;
    } catch (error) {
      console.error('Error deleting relation by user ID:', error);
      throw new Error('Failed to delete relation by user ID');
    }
  }

  async deleteRelationByAlgorithmId(algorithmID: string) {
    try {
      const result = await PrismaService.algorithmUserRelation.deleteMany({
        where: {
          algorithm_id: algorithmID,
        },
      });
      return result;
    } catch (error) {
      console.error('Error deleting relation by algorithm ID:', error);
      throw new Error('Failed to delete relation by algorithm ID');
    }
  }

  async deteleAllRelation() {
    try {
      const result = await PrismaService.algorithmUserRelation.deleteMany();
      return result;
    } catch (error) {
      console.error('Error deleting all relation:', error);
      throw new Error('Failed to delete all relation');
    }
  }
}
