import { Injectable } from '@nestjs/common';

export interface ServiceInfo {
  service: string;
  status: 'ok';
  version: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  getServiceInfo(): ServiceInfo {
    return {
      service: 'mohamy-pro-api',
      status: 'ok',
      version: '1',
      timestamp: new Date().toISOString(),
    };
  }
}
