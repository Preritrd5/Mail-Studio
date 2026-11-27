import { activityRepository } from '../repositories/activityRepository.js';

export async function listActivityHandler(req, res, next) {
  try {
    const {
      search,
      status,
      campaign_id,
      campaign_type,
      date_range,
      start_date,
      end_date,
      sort_by,
      sort_order,
      page,
      limit,
    } = req.query;

    const result = await activityRepository.getActivityList({
      search,
      status,
      campaignId: campaign_id,
      campaignType: campaign_type,
      dateRange: date_range,
      startDate: start_date,
      endDate: end_date,
      sortBy: sort_by,
      sortOrder: sort_order,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

export async function getActivityDetailHandler(req, res, next) {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Activity record ID is required.' },
      });
    }

    const detail = await activityRepository.getActivityDetail(id);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Activity record '${id}' not found.` },
      });
    }
    res.json({
      success: true,
      data: detail,
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: err.message },
      });
    }
    next(err);
  }
}

export async function retryActivityHandler(req, res, next) {
  try {
    const { id } = req.params;
    const retryResult = await activityRepository.retryActivity(id, req.user);

    res.json({
      success: true,
      message: retryResult.message || 'Retry operation executed.',
      data: retryResult,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: { code: err.code || 'RETRY_FAILED', message: err.message },
      });
    }
    next(err);
  }
}
