import { queueService } from '../queue/queueService.js';

export async function getQueueStatusHandler(req, res, next) {
  try {
    const health = await queueService.getQueueHealth();
    const campaigns = await queueService.getCampaigns({ page: 1, limit: 10 });

    res.json({
      success: true,
      data: {
        worker: health,
        active_campaigns: campaigns.campaigns,
        total_campaigns: campaigns.total,
        server_timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWorkerHealthHandler(req, res, next) {
  try {
    const health = await queueService.getQueueHealth();
    res.json({
      success: true,
      data: health,
    });
  } catch (err) {
    next(err);
  }
}

export async function listQueueCampaignsHandler(req, res, next) {
  try {
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const result = await queueService.getCampaigns({ status, page, limit });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignDetailsHandler(req, res, next) {
  try {
    const { id } = req.params;
    const details = await queueService.getCampaignDetails(id);
    res.json({
      success: true,
      data: details,
    });
  } catch (err) {
    next(err);
  }
}

export async function startCampaignHandler(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await queueService.startCampaign(id, req.user?.id || null);
    res.json({
      success: true,
      message: 'Campaign has been queued for sequential delivery.',
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
}

export async function pauseCampaignHandler(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await queueService.pauseCampaign(id, req.user?.id || null);
    res.json({
      success: true,
      message: 'Campaign execution paused.',
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
}

export async function resumeCampaignHandler(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await queueService.resumeCampaign(id, req.user?.id || null);
    res.json({
      success: true,
      message: 'Campaign execution resumed.',
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelCampaignHandler(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await queueService.cancelCampaign(id, req.user?.id || null);
    res.json({
      success: true,
      message: 'Campaign execution cancelled.',
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
}

export async function resolveOutcomeUnknownHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { resolution, notes } = req.body;

    if (!resolution || !['sent', 'failed'].includes(resolution)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_RESOLUTION', message: "Resolution must be either 'sent' or 'failed'." },
      });
    }

    const updated = await queueService.resolveOutcomeUnknown({
      recipientId: id,
      resolution,
      notes,
      adminUserId: req.user?.id || null,
    });

    res.json({
      success: true,
      message: `Recipient marked as '${resolution}'.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function executeStepHandler(req, res, next) {
  try {
    const workerId = queueService.getDefaultAutoWorkerId();
    const result = await queueService.executeSingleQueueStep(workerId);
    const worker = await queueService.getQueueHealth();
    res.json({
      success: true,
      data: {
        ...result,
        worker,
        server_timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}
