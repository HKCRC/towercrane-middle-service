import { Inject, Provide } from '@midwayjs/core';
import { PrismaService } from '@/providers/prisma';
import { JwtService } from '@midwayjs/jwt';
import { PasswordService } from '@/service/password.service';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '@/constant';

@Provide()
export class AdminService {
  @Inject()
  jwt: JwtService;

  async login(phoneNumber: string, password: string) {
    const user = await PrismaService.user.findFirst({
      where: {
        phoneNumber: phoneNumber,
      },
    });

    if (
      user &&
      (await PasswordService.comparePassword(password, user.password))
    ) {
      const tokenPayload = { userId: user.uid, phoneNumber: user.phoneNumber };

      const generateJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '7d',
        audience: 'hkcrc',
      });
      const generateLongJwt = await this.jwt.sign(
        tokenPayload,
        process.env.JWT_PRIVATE_KEY,
        {
          expiresIn: '14d',
          audience: 'hkcrc',
        }
      );
      return {
        ...user,
        token: generateJwt,
        longToken: generateLongJwt,
      };
    } else {
      throw new Error('Invalid username or password');
    }
  }

  async register(phoneNumber: string, password: string) {
    const hashedPassword = await PasswordService.hashPassword(password);

    return await PrismaService.user.create({
      data: {
        phoneNumber: phoneNumber,
        uid: uuidv4(),
        password: hashedPassword,
        role: UserRole.USER,
      },
    });
  }
}
