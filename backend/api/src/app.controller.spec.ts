import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('service info', () => {
    it('should return the API service contract', () => {
      expect(appController.getServiceInfo()).toMatchObject({
        service: 'mohamy-pro-api',
        status: 'ok',
        version: '1',
      });
    });
  });
});
