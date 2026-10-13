import { Test } from '@nestjs/testing';
import { ThumbnailService } from './worker/thumbnail.service';
import { VideoProbeService } from './worker/video-probe.service';
import { VideoProcessingProcessor } from './worker/video-processing.processor';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('should compile and expose the worker providers', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(module.get(VideoProbeService)).toBeDefined();
    expect(module.get(ThumbnailService)).toBeDefined();
    expect(module.get(VideoProcessingProcessor)).toBeDefined();
    await module.close();
  }, 60000);
});
