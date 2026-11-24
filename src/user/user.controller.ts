import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  BadRequestException,
  Header,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  UpdateUserDto,
  CreateUserDto,
  CreateMemberDto,
} from './dto/user.dto.js';

@Controller('user')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('/create/member')
  async createMember(@Body() data: CreateMemberDto) {
    const user = await this.userService.createMember(data);
    return {
      message: 'member created',
      user,
    };
  }

  @Get('/members/import-template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="member-import-template.xlsx"')
  downloadMemberImportTemplate() {
    return this.userService.createMemberImportTemplate();
  }

  @Post('/members/import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
          callback(new BadRequestException('Upload an .xlsx workbook'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  importMembers(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) {
      throw new BadRequestException('Choose an .xlsx workbook to import');
    }
    return this.userService.importMembersWorkbook(file.buffer);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
