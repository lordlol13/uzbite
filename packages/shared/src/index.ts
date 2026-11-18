/** JSON transport contracts shared by UzBite Business desktop, backend API, and MCP server. */
export type Language = 'ru' | 'uz' | 'en';
export type Theme = 'light' | 'dark';
export interface ApiResponse<T> { data: T }
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; hasMore: boolean }
/** Money uses PostgreSQL Decimal on the server; JSON numbers are only for display. */
export type Money = number;

export const EXPENSE_CATEGORIES = [
  'INGREDIENTS',
  'PACKAGING',
  'SALARY',
  'RENT',
  'UTILITIES',
  'COMMUNICATION',
  'MARKETING',
  'DELIVERY',
  'EQUIPMENT',
  'TAXES',
  'OTHER',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface BusinessUser {
  id: string;
  email: string | null;
  name: string;
  username: string;
  role: 'RESTAURANT';
  restaurantId: string;
  restaurantName: string;
}

export interface BusinessRestaurantOption {
  id: string;
  slug: string;
  name: string;
  logoUrl: string;
  addressText: string;
}

export interface BusinessLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: BusinessUser;
  restaurants: BusinessRestaurantOption[];
}

export interface SupplierDto {
  id: string;
  restaurantId: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  category: ExpenseCategory;
  expenseCount: number;
  totalSpent: Money;
  lastSpentAt: string | null;
  itemsSupplied: string[];
  createdAt: string;
}

export interface ExpenseDto {
  id: string;
  restaurantId: string;
  supplierId: string | null;
  supplierName: string | null;
  category: ExpenseCategory;
  itemName: string;
  description: string;
  amount: Money;
  quantity: number | null;
  unit: string | null;
  unitPrice: Money | null;
  invoiceNumber: string | null;
  spentAt: string;
  receiptId: string | null;
  source: string;
  isVerified: boolean;
  createdAt: string;
}

export interface ExpenseBudgetDto {
  id: string;
  restaurantId: string;
  category: ExpenseCategory;
  month: string;
  limit: Money;
  actual: Money;
  forecast: Money;
  variance: Money;
  usagePct: number;
  status: 'OK' | 'WARNING' | 'OVERRUN';
}

export interface CategoryBreakdownItem {
  category: ExpenseCategory;
  amount: Money;
  sharePct: number;
  prevAmount: Money;
  growthPct: number;
  budgetLimit: Money | null;
}

export interface BusinessKpiOverview {
  period: { from: string; to: string; days: number };
  revenue: Money;
  revenuePrev: Money;
  revenueDeltaPct: number;
  deliveredOrders: number;
  deliveredOrdersPrev: number;
  ordersDeltaPct: number;
  cancelledOrders: number;
  cancelRatePct: number;
  lostRevenue: Money;
  avgOrderValue: Money;
  avgOrderValuePrev: Money;
  totalExpenses: Money;
  totalExpensesPrev: Money;
  expensesDeltaPct: number;
  TheoreticalCogs: Money;
  foodCostPct: number;
  laborCostPct: number;
  adminUtilityCostPct: number;
  primeCostPct?: number;
  theoreticalFoodCostPct?: number;
  cogsVarianceUZS?: Money;
  cogsVariancePct?: number;
  breakEvenRevenue?: Money;
  dailyRevenueAvg?: Money;
  dailyExpenseBurn?: Money;
  revenueTrendSlope?: number;
  expenseTrendSlope?: number;
  grossProfit: Money;
  netProfit: Money;
  netProfitPrev: Money;
  netMarginPct: number;
  avgRating: number | null;
  reviewCount: number;
  paymentSplit: {
    cashOrders: number;
    cardOrders: number;
    cashRevenue: Money;
    cardRevenue: Money;
    unpaidCardOrders: number;
    unpaidCardAmount: Money;
  };
  categoryBreakdown: CategoryBreakdownItem[];
}

export interface TimeseriesPoint {
  bucket: string;
  revenue: Money;
  expenses: Money;
  profit: Money;
  orders: number;
}

export interface DishAnalyticsItem {
  dishId: string;
  name: string;
  categoryName: string;
  price: Money;
  costPrice: Money;
  unitMargin: Money;
  marginPct: number;
  quantitySold: number;
  revenue: Money;
  totalCost: Money;
  totalProfit: Money;
  revenueSharePct: number;
  abcClass: 'A' | 'B' | 'C';
  quadrant: 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';
  recommendedPrice?: Money;
}

export interface HourlyHeatmapCell {
  weekday: number;
  hour: number;
  orders: number;
  revenue: Money;
}

export type FindingKind = 'ERROR' | 'INEFFICIENCY' | 'RISK';
export type FindingSeverity = 'low' | 'medium' | 'high';

export interface Finding {
  id: string;
  kind: FindingKind;
  code: string;
  severity: FindingSeverity;
  category?: ExpenseCategory;
  title: Record<Language, string>;
  detail: Record<Language, string>;
  recommendation: Record<Language, string>;
  amountImpact: Money;
  expenseIds?: string[];
  dishIds?: string[];
  supplierId?: string;
  metrics?: Record<string, number | string>;
}

export interface AiRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: Record<Language, string>;
  action: Record<Language, string>;
  expectedSavingUZS: Money;
  findingCodes: string[];
}

export interface AiOptimizationReport {
  generatedAt: string;
  source: 'gemini' | 'heuristic';
  healthScore: number;
  statusLabel: Record<Language, string>;
  executiveSummary: Record<Language, string>;
  totalPotentialSavingUZS: Money;
  errorCount: number;
  inefficiencyCount: number;
  riskCount: number;
  recommendations: AiRecommendation[];
}

export interface ExpenseClassificationResult {
  category: ExpenseCategory;
  confidence: number;
  matchedKeywords: string[];
  reason: Record<Language, string>;
}

export interface BusinessAnalysisResponse {
  overview: BusinessKpiOverview;
  findings: Finding[];
  report: AiOptimizationReport;
  dishes?: DishAnalyticsItem[];
  budgets?: ExpenseBudgetDto[];
  timeseries?: TimeseriesPoint[];
  heatmap?: HourlyHeatmapCell[];
}

export interface OcrExpenseDraft {
  supplierName: string;
  invoiceNumber: string;
  spentAt: string;
  category: ExpenseCategory;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: Money;
  amount: Money;
  confidence: number;
}

export interface AiChatResponse {
  answer: Record<Language, string>;
  highlights: string[];
  relatedFindingCodes: string[];
  source: 'gemini' | 'heuristic';
}

// --- AI Finance Agent, Points 24/25/26, Tashkent Geo Map & MCP Contracts ---

export const TASHKENT_DISTRICT_IDS = [
  'chilonzor',
  'yunusobod',
  'mirzo_ulugbek',
  'yakkasaroy',
  'mirobod',
  'shayxontohur',
  'olmazor',
  'uchtepa',
  'yashnobod',
  'sergeli',
  'yangihayot',
  'bektemir',
] as const;

export type TashkentDistrictId = (typeof TASHKENT_DISTRICT_IDS)[number];

export interface DistrictStatItem {
  districtId: TashkentDistrictId;
  name: Record<Language, string>;
  center: { latitude: number; longitude: number };
  orders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  uniqueClients: number;
  revenue: Money;
  avgCheck: Money;
  sharePct: number;
  growthPct: number;
  avgDistanceKm: number;
  avgDeliveryMinutes: number;
  deliveryFeeRevenue: Money;
  estimatedCourierCost: Money;
  deliveryMargin: Money;
  nearestBranchId: string;
  nearestBranchName: string;
  demandScore: number;
  status: 'HIGH_DEMAND' | 'PROFITABLE' | 'UNDERSERVED' | 'LOSS_DELIVERY';
}

export interface DistrictBranchMarker {
  id: string;
  name: string;
  addressText: string;
  latitude: number;
  longitude: number;
  districtId: TashkentDistrictId;
  districtName: Record<Language, string>;
  orders: number;
  revenue: Money;
}

export interface OrderHeatmapCell {
  latCenter: number;
  lngCenter: number;
  orders: number;
  revenue: Money;
  districtId: TashkentDistrictId;
}

export interface DistrictGeoAnalysisResponse {
  period: { from: string; to: string; days: number };
  restaurantId: string | 'ALL';
  totalOrders: number;
  totalRevenue: Money;
  topDistrict: DistrictStatItem | null;
  underservedDistricts: DistrictStatItem[];
  lossMakingDeliveryDistricts: DistrictStatItem[];
  districts: DistrictStatItem[];
  branches: DistrictBranchMarker[];
  heatmapCells?: OrderHeatmapCell[];
}

export interface BranchPerformanceItem {
  restaurantId: string;
  name: string;
  districtName: Record<Language, string>;
  revenue: Money;
  expenses: Money;
  netProfit: Money;
  netMarginPct: number;
  roiPct: number;
  orders: number;
  growthPct: number;
  budgetDisciplineScore: number;
  efficiencyScore: number;
  currentBudget: Money;
  recommendedBudget: Money;
  deltaBudget: Money;
  deltaPct: number;
  expectedRevenueLift: Money;
  rationale: Record<Language, string>;
  categoryAllocations: Array<{
    category: ExpenseCategory;
    recommendedLimit: Money;
  }>;
}

export interface BranchAllocationResponse {
  totalBudget: Money;
  objective: 'profit' | 'balanced' | 'growth';
  month: string;
  expectedTotalProfitLift: Money;
  branches: BranchPerformanceItem[];
}

export interface BudgetVarianceItem {
  category: ExpenseCategory;
  month: string;
  limit: Money;
  actual: Money;
  forecast: Money;
  variance: Money;
  projectedOverrun: Money;
  usagePct: number;
  dailyBurnRate: Money;
  trendSlopeUZS: number;
  projectedBreachDate: string | null;
  daysUntilBreach: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  drivers: {
    priceEffectUZS: Money;
    volumeEffectUZS: Money;
    newItemsEffectUZS: Money;
    topSupplierName: string | null;
    topSupplierSpend: Money;
    explanation: Record<Language, string>;
  };
}

export type AgentNavTab =
  | 'dashboard'
  | 'agent'
  | 'audit'
  | 'expenses'
  | 'budgets'
  | 'branches'
  | 'map'
  | 'sales';

export type AgentClientAction =
  | { type: 'navigate'; tab: AgentNavTab; label: string }
  | {
      type: 'set_filters';
      restaurantId?: string;
      days?: number;
      month?: string;
      from?: string;
      to?: string;
      districtId?: TashkentDistrictId | '';
      label: string;
    }
  | { type: 'highlight_widget'; widgetId: string; tab?: AgentNavTab; label: string }
  | { type: 'pin_widget'; block: AgentUiBlock; label: string }
  | { type: 'unpin_widget'; blockId?: string; clearAll?: boolean; label: string }
  | { type: 'create_dashboard'; title: string; blocks: AgentUiBlock[]; label: string }
  | {
      type: 'update_dashboard';
      dashboardId?: string;
      title?: string;
      blocks: AgentUiBlock[];
      mode: 'replace' | 'append';
      label: string;
    }
  | {
      type: 'rename_dashboard';
      dashboardId?: string;
      title: string;
      label: string;
    }
  | {
      type: 'delete_dashboard';
      dashboardId?: string;
      deleteAll?: boolean;
      label: string;
    }
  | {
      type: 'select_dashboard';
      dashboardId: string | null;
      titleMatch?: string;
      label: string;
    }
  | {
      type: 'remove_dashboard_widget';
      dashboardId?: string;
      blockKind?: AgentUiBlock['kind'];
      blockId?: string;
      label: string;
    }
  | {
      type: 'apply_branch_budgets';
      month: string;
      allocations: Array<{ restaurantId: string; category: ExpenseCategory; limit: Money }>;
      label: string;
    }
  | {
      type: 'fix_finding';
      findingId: string;
      code: string;
      expenseId?: string;
      duplicateExpenseId?: string;
      expectedAmount?: number;
      suggestedCategory?: ExpenseCategory;
      label: string;
    };

export type AgentUiBlock =
  | {
      id: string;
      kind: 'kpis';
      title?: string;
      items: Array<{
        label: string;
        value: string;
        sublabel?: string;
        tone?: 'good' | 'warn' | 'bad' | 'neutral';
      }>;
    }
  | {
      id: string;
      kind: 'chart';
      chartType: 'bar' | 'line' | 'donut' | 'horizontal_bar';
      title: string;
      subtitle?: string;
      items: Array<{
        label: string;
        value: number;
        secondaryValue?: number;
        secondaryLabel?: string;
        color?: string;
      }>;
    }
  | {
      id: string;
      kind: 'table';
      title: string;
      columns: string[];
      rows: Array<Array<string | number>>;
      highlightRowIndices?: number[];
    }
  | {
      id: string;
      kind: 'alert';
      severity: 'info' | 'warning' | 'critical';
      title: string;
      body: string;
    }
  | {
      id: string;
      kind: 'map';
      title: string;
      metric: 'orders' | 'revenue' | 'avgCheck' | 'deliveryMargin';
      highlightDistrictId?: TashkentDistrictId;
      districts: DistrictStatItem[];
      branches?: DistrictBranchMarker[];
      heatmapCells?: OrderHeatmapCell[];
    }
  | {
      id: string;
      kind: 'allocation';
      title: string;
      allocation: BranchAllocationResponse;
    }
  | {
      id: string;
      kind: 'actions';
      title?: string;
      actions: AgentClientAction[];
    };

export interface AgentToolTrace {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  summary: string;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentDashboardSummary {
  id: string;
  title: string;
  blockCount: number;
  blockKinds?: string[];
}

export interface AgentScreenContext {
  activeTab: AgentNavTab;
  restaurantId: string;
  days: number;
  month: string;
  districtId?: TashkentDistrictId | '';
  visibleWidgets?: string[];
  summaryText?: string;
  activeCustomDashboardId?: string | null;
  customDashboards?: AgentDashboardSummary[];
  pinnedWidgetsCount?: number;
}

export interface AgentChatResponse {
  requestId: string;
  model: string;
  source: 'coarena' | 'heuristic';
  answer: Record<Language, string>;
  uiBlocks: AgentUiBlock[];
  autoActions: AgentClientAction[];
  suggestedActions: AgentClientAction[];
  toolTraces: AgentToolTrace[];
  relatedFindingCodes: string[];
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  category: 'point_24' | 'point_25' | 'point_26' | 'geo_map' | 'ui_control';
  inputSchema: Record<string, unknown>;
}

export interface TashkentDistrictShape {
  id: TashkentDistrictId;
  name: Record<Language, string>;
  shortName: Record<Language, string>;
  center: { latitude: number; longitude: number };
  /** Polygon vertices in [longitude, latitude] order */
  polygon: Array<[number, number]>;
}

/** Official OpenStreetMap administrative boundaries (relations) for all 12 districts of Tashkent */
export const TASHKENT_DISTRICTS: TashkentDistrictShape[] = [
  {
    id: 'olmazor',
    name: {"uz":"Olmazor tumani","ru":"Алмазарский район","en":"Olmazor District"},
    shortName: {"uz":"Olmazor","ru":"Алмазар","en":"Olmazor"},
    center: { latitude: 41.3543, longitude: 69.228 },
    polygon: [
      [69.16504, 41.34837], [69.17324, 41.34834], [69.17848, 41.34935], [69.18223, 41.34941], [69.18699, 41.35012], [69.18849, 41.3501],
      [69.19424, 41.34877], [69.19761, 41.34823], [69.2012, 41.34699], [69.20655, 41.34543], [69.20705, 41.34522], [69.20701, 41.3448],
      [69.20496, 41.34093], [69.20489, 41.34064], [69.20503, 41.34039], [69.23185, 41.32517], [69.23589, 41.32927], [69.23856, 41.32894],
      [69.23925, 41.32863], [69.24133, 41.32556], [69.24314, 41.32584], [69.24521, 41.32583], [69.24815, 41.32897], [69.24887, 41.32857],
      [69.24863, 41.3288], [69.24868, 41.32895], [69.25054, 41.331], [69.25751, 41.338], [69.2604, 41.34044], [69.26282, 41.34394],
      [69.26298, 41.3441], [69.26307, 41.3442], [69.26407, 41.34532], [69.26435, 41.34609], [69.26134, 41.34793], [69.26962, 41.35565],
      [69.26148, 41.36314], [69.24112, 41.37806], [69.23743, 41.38225], [69.22979, 41.39297], [69.22798, 41.39509], [69.2225, 41.39169],
      [69.21574, 41.38737], [69.21371, 41.38698], [69.21172, 41.38697], [69.21127, 41.38669], [69.21133, 41.386], [69.21046, 41.384],
      [69.17436, 41.36157], [69.16888, 41.35684], [69.1667, 41.35376], [69.1657, 41.35109], [69.16505, 41.34845],
    ],
  },
  {
    id: 'yunusobod',
    name: {"uz":"Yunusobod tumani","ru":"Юнусабадский район","en":"Yunusobod District"},
    shortName: {"uz":"Yunusobod","ru":"Юнусабад","en":"Yunusobod"},
    center: { latitude: 41.3614, longitude: 69.293 },
    polygon: [
      [69.22798, 41.39509], [69.22979, 41.39297], [69.23743, 41.38225], [69.24112, 41.37806], [69.26148, 41.36314], [69.26962, 41.35565],
      [69.26134, 41.34793], [69.26435, 41.34609], [69.26407, 41.34532], [69.26307, 41.3442], [69.26298, 41.3441], [69.26318, 41.34399],
      [69.27491, 41.33734], [69.27451, 41.33691], [69.2736, 41.33454], [69.27294, 41.33353], [69.27292, 41.33263], [69.27316, 41.33208],
      [69.27287, 41.33011], [69.27259, 41.32979], [69.27095, 41.32894], [69.27022, 41.32747], [69.27035, 41.32706], [69.27086, 41.32643],
      [69.27077, 41.32584], [69.26984, 41.32487], [69.26922, 41.32295], [69.26797, 41.3217], [69.26659, 41.31821], [69.26547, 41.31693],
      [69.26416, 41.31353], [69.26366, 41.31316], [69.26324, 41.31236], [69.26069, 41.3121], [69.26018, 41.31173], [69.26002, 41.31136],
      [69.25997, 41.3111], [69.26028, 41.311], [69.26393, 41.31072], [69.26742, 41.30942], [69.26759, 41.30937], [69.26764, 41.30947],
      [69.26823, 41.31077], [69.26961, 41.31042], [69.27051, 41.3124], [69.27759, 41.31048], [69.28051, 41.30993], [69.28083, 41.30994],
      [69.28102, 41.31012], [69.28153, 41.31097], [69.28155, 41.31107], [69.28155, 41.31114], [69.28129, 41.3119], [69.28019, 41.31265],
      [69.28069, 41.31507], [69.28266, 41.31437], [69.28604, 41.31817], [69.2907, 41.31766], [69.2914, 41.31807], [69.29156, 41.31825],
      [69.29129, 41.31994], [69.29173, 41.32263], [69.2934, 41.32249], [69.29291, 41.32301], [69.29304, 41.32368], [69.29374, 41.32497],
      [69.29427, 41.32503], [69.29466, 41.32559], [69.2964, 41.32512], [69.29643, 41.32528], [69.29783, 41.3261], [69.29816, 41.32773],
      [69.29739, 41.32851], [69.29662, 41.32865], [69.29648, 41.32939], [69.297, 41.32995], [69.29773, 41.33041], [69.29852, 41.32993],
      [69.29925, 41.33001], [69.30057, 41.33067], [69.30121, 41.33154], [69.30165, 41.33168], [69.3016, 41.33211], [69.3004, 41.33291],
      [69.30023, 41.3334], [69.30104, 41.33469], [69.30254, 41.33618], [69.31091, 41.33699], [69.31138, 41.33553], [69.31347, 41.33222],
      [69.31323, 41.33189], [69.31567, 41.33283], [69.31648, 41.33329], [69.31705, 41.33441], [69.31715, 41.33532], [69.31671, 41.33608],
      [69.31614, 41.33636], [69.31579, 41.33678], [69.31559, 41.33739], [69.31567, 41.33855], [69.31614, 41.33913], [69.31696, 41.33935],
      [69.31718, 41.34026], [69.31866, 41.34095], [69.31899, 41.34146], [69.319, 41.34314], [69.3193, 41.34358], [69.32147, 41.34532],
      [69.32225, 41.34694], [69.32302, 41.34736], [69.32447, 41.3474], [69.32536, 41.34793], [69.32571, 41.34973], [69.32593, 41.35017],
      [69.32566, 41.35102], [69.32575, 41.35124], [69.33261, 41.35117], [69.33365, 41.35086], [69.33529, 41.35233], [69.33676, 41.35322],
      [69.34183, 41.35555], [69.34406, 41.35601], [69.34379, 41.35618], [69.33828, 41.35955], [69.32459, 41.37014], [69.32415, 41.37077],
      [69.32291, 41.37342], [69.31896, 41.38272], [69.31836, 41.38351], [69.3177, 41.38406], [69.3158, 41.3849], [69.31171, 41.38514],
      [69.30059, 41.38395], [69.29017, 41.38379], [69.28819, 41.38364], [69.28509, 41.3838], [69.28234, 41.38459], [69.28099, 41.38521],
      [69.26397, 41.39608], [69.26178, 41.39713], [69.25773, 41.39786], [69.23896, 41.39864], [69.23588, 41.39848], [69.23246, 41.39769],
      [69.22936, 41.39597],
    ],
  },
  {
    id: 'mirzo_ulugbek',
    name: {"uz":"Mirzo Ulug'bek tumani","ru":"Мирзо-Улугбекский район","en":"Mirzo Ulug'bek District"},
    shortName: {"uz":"M. Ulug'bek","ru":"М. Улугбек","en":"M. Ulug'bek"},
    center: { latitude: 41.335, longitude: 69.345 },
    polygon: [
      [69.28155, 41.31114], [69.28155, 41.31107], [69.28159, 41.31084], [69.28177, 41.31063], [69.29411, 41.30713], [69.29595, 41.30701],
      [69.29893, 41.30757], [69.29844, 41.30759], [69.29823, 41.30786], [69.29824, 41.3092], [69.2985, 41.30923], [69.29849, 41.30966],
      [69.29947, 41.31054], [69.30027, 41.31031], [69.30135, 41.31169], [69.3012, 41.31181], [69.30173, 41.31256], [69.30233, 41.31267],
      [69.30276, 41.31206], [69.30384, 41.31189], [69.30507, 41.31217], [69.30571, 41.31272], [69.30608, 41.31265], [69.30667, 41.31291],
      [69.30747, 41.31259], [69.30766, 41.31274], [69.30788, 41.31401], [69.30912, 41.31524], [69.31037, 41.31701], [69.31096, 41.31892],
      [69.31343, 41.31818], [69.31695, 41.31671], [69.32061, 41.31547], [69.32874, 41.31449], [69.33562, 41.30963], [69.33952, 41.3061],
      [69.34057, 41.30621], [69.34175, 41.30699], [69.34365, 41.30954], [69.35465, 41.31564], [69.37539, 41.33036], [69.37836, 41.33403],
      [69.37965, 41.3364], [69.38093, 41.33746], [69.3848, 41.33836], [69.38612, 41.33846], [69.3871, 41.33841], [69.39315, 41.33734],
      [69.39479, 41.33732], [69.39747, 41.33769], [69.40789, 41.34222], [69.40971, 41.34419], [69.41115, 41.34777], [69.41161, 41.35023],
      [69.4108, 41.35566], [69.40952, 41.35773], [69.4088, 41.35805], [69.40667, 41.36184], [69.40599, 41.3619], [69.40543, 41.36236],
      [69.4046, 41.36377], [69.4044, 41.36383], [69.4016, 41.36302], [69.40101, 41.3649], [69.4006, 41.36476], [69.40045, 41.36506],
      [69.39977, 41.3648], [69.39886, 41.36599], [69.39589, 41.36432], [69.39543, 41.36486], [69.39441, 41.36543], [69.39213, 41.36613],
      [69.39099, 41.36622], [69.38925, 41.3658], [69.3774, 41.36163], [69.37542, 41.36134], [69.36479, 41.36256], [69.36325, 41.36238],
      [69.36273, 41.3622], [69.36166, 41.36143], [69.35907, 41.35823], [69.35676, 41.35579], [69.35551, 41.3552], [69.35396, 41.35476],
      [69.35133, 41.35466], [69.3499, 41.35492], [69.34677, 41.35582], [69.34426, 41.35602], [69.34406, 41.35601], [69.34183, 41.35555],
      [69.33676, 41.35322], [69.33529, 41.35233], [69.33365, 41.35086], [69.33261, 41.35117], [69.32575, 41.35124], [69.32566, 41.35102],
      [69.32593, 41.35017], [69.32571, 41.34973], [69.32536, 41.34793], [69.32447, 41.3474], [69.32302, 41.34736], [69.32225, 41.34694],
      [69.32147, 41.34532], [69.3193, 41.34358], [69.319, 41.34314], [69.31899, 41.34146], [69.31866, 41.34095], [69.31718, 41.34026],
      [69.31696, 41.33935], [69.31614, 41.33913], [69.31567, 41.33855], [69.31559, 41.33739], [69.31579, 41.33678], [69.31614, 41.33636],
      [69.31671, 41.33608], [69.31715, 41.33532], [69.31705, 41.33441], [69.31648, 41.33329], [69.31567, 41.33283], [69.31323, 41.33189],
      [69.31347, 41.33222], [69.31138, 41.33553], [69.31091, 41.33699], [69.30254, 41.33618], [69.30104, 41.33469], [69.30023, 41.3334],
      [69.3004, 41.33291], [69.3016, 41.33211], [69.30165, 41.33168], [69.30121, 41.33154], [69.30057, 41.33067], [69.29925, 41.33001],
      [69.29852, 41.32993], [69.29773, 41.33041], [69.297, 41.32995], [69.29648, 41.32939], [69.29662, 41.32865], [69.29739, 41.32851],
      [69.29816, 41.32773], [69.29783, 41.3261], [69.29643, 41.32528], [69.2964, 41.32512], [69.29466, 41.32559], [69.29427, 41.32503],
      [69.29374, 41.32497], [69.29304, 41.32368], [69.29291, 41.32301], [69.2934, 41.32249], [69.29173, 41.32263], [69.29129, 41.31994],
      [69.29156, 41.31825], [69.2914, 41.31807], [69.2907, 41.31766], [69.28604, 41.31817], [69.28266, 41.31437], [69.28069, 41.31507],
      [69.28019, 41.31265], [69.28129, 41.3119],
    ],
  },
  {
    id: 'shayxontohur',
    name: {"uz":"Shayxontohur tumani","ru":"Шайхантахурский район","en":"Shayxontohur District"},
    shortName: {"uz":"Shayxontohur","ru":"Шайхантахур","en":"Shayxontohur"},
    center: { latitude: 41.3185, longitude: 69.2165 },
    polygon: [
      [69.15986, 41.3282], [69.16038, 41.32804], [69.1639, 41.33109], [69.16542, 41.33138], [69.16754, 41.33057], [69.1676, 41.32806],
      [69.16926, 41.32821], [69.19394, 41.32651], [69.19312, 41.32544], [69.19294, 41.32474], [69.1937, 41.30326], [69.19371, 41.30302],
      [69.19427, 41.30284], [69.19699, 41.30185], [69.19823, 41.30169], [69.20043, 41.30072], [69.2019, 41.30057], [69.21902, 41.30103],
      [69.22054, 41.30134], [69.22231, 41.30221], [69.22332, 41.30226], [69.23157, 41.29959], [69.23351, 41.30176], [69.24144, 41.31194],
      [69.25965, 41.31117], [69.25997, 41.3111], [69.26002, 41.31136], [69.26018, 41.31173], [69.26069, 41.3121], [69.26324, 41.31236],
      [69.26366, 41.31316], [69.26416, 41.31353], [69.26547, 41.31693], [69.26659, 41.31821], [69.26797, 41.3217], [69.26922, 41.32295],
      [69.26984, 41.32487], [69.27077, 41.32584], [69.27086, 41.32643], [69.27035, 41.32706], [69.27022, 41.32747], [69.27095, 41.32894],
      [69.27259, 41.32979], [69.27287, 41.33011], [69.27316, 41.33208], [69.27292, 41.33263], [69.27294, 41.33353], [69.2736, 41.33454],
      [69.27451, 41.33691], [69.27491, 41.33734], [69.26318, 41.34399], [69.26298, 41.3441], [69.26282, 41.34394], [69.2604, 41.34044],
      [69.25751, 41.338], [69.25054, 41.331], [69.24868, 41.32895], [69.24863, 41.3288], [69.24887, 41.32857], [69.24815, 41.32897],
      [69.24521, 41.32583], [69.24314, 41.32584], [69.24133, 41.32556], [69.23925, 41.32863], [69.23856, 41.32894], [69.23589, 41.32927],
      [69.23185, 41.32517], [69.20503, 41.34039], [69.20489, 41.34064], [69.20496, 41.34093], [69.20701, 41.3448], [69.20705, 41.34522],
      [69.20655, 41.34543], [69.2012, 41.34699], [69.19761, 41.34823], [69.19424, 41.34877], [69.18849, 41.3501], [69.18699, 41.35012],
      [69.18223, 41.34941], [69.17848, 41.34935], [69.17324, 41.34834], [69.16504, 41.34837], [69.16457, 41.34625], [69.16399, 41.33692],
      [69.16358, 41.33543], [69.16271, 41.33333], [69.16083, 41.33029], [69.15993, 41.32837],
    ],
  },
  {
    id: 'uchtepa',
    name: {"uz":"Uchtepa tumani","ru":"Учтепинский район","en":"Uchtepa District"},
    shortName: {"uz":"Uchtepa","ru":"Учтепа","en":"Uchtepa"},
    center: { latitude: 41.2925, longitude: 69.167 },
    polygon: [
      [69.14883, 41.26106], [69.14889, 41.26098], [69.14948, 41.26131], [69.1583, 41.26447], [69.16192, 41.26643], [69.16256, 41.26696],
      [69.16387, 41.26863], [69.16419, 41.26878], [69.1678, 41.26778], [69.17118, 41.26983], [69.17225, 41.26882], [69.17604, 41.2711],
      [69.17741, 41.27155], [69.19317, 41.27527], [69.19595, 41.27671], [69.19791, 41.27875], [69.19452, 41.28092], [69.19465, 41.28103],
      [69.19371, 41.30213], [69.19371, 41.30302], [69.1937, 41.30326], [69.19294, 41.32474], [69.19312, 41.32544], [69.19394, 41.32651],
      [69.16926, 41.32821], [69.1676, 41.32806], [69.16754, 41.33057], [69.16542, 41.33138], [69.1639, 41.33109], [69.16038, 41.32804],
      [69.15986, 41.3282], [69.15937, 41.32853], [69.15784, 41.32824], [69.15705, 41.32744], [69.15664, 41.32724], [69.15522, 41.32747],
      [69.15486, 41.32723], [69.15448, 41.32652], [69.15474, 41.326], [69.15354, 41.32519], [69.15402, 41.32446], [69.1536, 41.32338],
      [69.15435, 41.32283], [69.15461, 41.32242], [69.15429, 41.32159], [69.15348, 41.32117], [69.15209, 41.31975], [69.1518, 41.31895],
      [69.14983, 41.31614], [69.14974, 41.31566], [69.14833, 41.31455], [69.14826, 41.31377], [69.14754, 41.31312], [69.14728, 41.31324],
      [69.14698, 41.31373], [69.14663, 41.31366], [69.14664, 41.3134], [69.1474, 41.31241], [69.14751, 41.31189], [69.14815, 41.31162],
      [69.14808, 41.31135], [69.14763, 41.31116], [69.1474, 41.31082], [69.14733, 41.31008], [69.14839, 41.30994], [69.1485, 41.30938],
      [69.14909, 41.30816], [69.14889, 41.30758], [69.14893, 41.30715], [69.14869, 41.30683], [69.14875, 41.30592], [69.1485, 41.30511],
      [69.14793, 41.3043], [69.14724, 41.30388], [69.1465, 41.3038], [69.14598, 41.30302], [69.14533, 41.30277], [69.14468, 41.30173],
      [69.14496, 41.30115], [69.1449, 41.30064], [69.14435, 41.30028], [69.14338, 41.30015], [69.1429, 41.29984], [69.14305, 41.29926],
      [69.14289, 41.2988], [69.14199, 41.29829], [69.14113, 41.29676], [69.1402, 41.29654], [69.14008, 41.29639], [69.14019, 41.29595],
      [69.13971, 41.29545], [69.13929, 41.29516], [69.13845, 41.29493], [69.13839, 41.29448], [69.13877, 41.29393], [69.13826, 41.29241],
      [69.13692, 41.29169], [69.1362, 41.29092], [69.13521, 41.29077], [69.13489, 41.29018], [69.13377, 41.28977], [69.13376, 41.28953],
      [69.13411, 41.28908], [69.13406, 41.28883], [69.13287, 41.28846], [69.13212, 41.288], [69.13192, 41.28762], [69.13398, 41.28497],
      [69.13493, 41.28412], [69.1349, 41.28354], [69.13455, 41.28323], [69.13427, 41.28266], [69.13441, 41.28209], [69.13424, 41.28138],
      [69.13292, 41.28027], [69.13346, 41.27892], [69.13304, 41.27881], [69.13217, 41.27907], [69.13155, 41.27895], [69.13087, 41.27811],
      [69.1306, 41.27738], [69.12879, 41.27609], [69.12833, 41.27534], [69.12835, 41.27453], [69.12811, 41.27405], [69.12745, 41.27363],
      [69.12684, 41.27292], [69.12569, 41.27216], [69.12558, 41.27168], [69.12573, 41.27083], [69.1253, 41.27009], [69.1229, 41.26994],
      [69.12279, 41.26982], [69.12291, 41.26856], [69.12281, 41.26793], [69.12218, 41.26717], [69.1218, 41.26626], [69.12258, 41.26607],
      [69.12261, 41.26646], [69.12315, 41.26714], [69.12411, 41.26726], [69.12518, 41.26685], [69.12838, 41.26813], [69.13149, 41.269],
      [69.13526, 41.27232], [69.13712, 41.27308], [69.13988, 41.27525], [69.14076, 41.27647], [69.14093, 41.27696], [69.14087, 41.27764],
      [69.14102, 41.27786], [69.14188, 41.27796], [69.14316, 41.27865], [69.14482, 41.28048], [69.14653, 41.28122], [69.14695, 41.28122],
      [69.14755, 41.28096], [69.14657, 41.27773], [69.14646, 41.27658], [69.14707, 41.26513], [69.14722, 41.26419], [69.1477, 41.26284],
    ],
  },
  {
    id: 'chilonzor',
    name: {"uz":"Chilonzor tumani","ru":"Чиланзарский район","en":"Chilonzor District"},
    shortName: {"uz":"Chilonzor","ru":"Чиланзар","en":"Chilonzor"},
    center: { latitude: 41.268, longitude: 69.202 },
    polygon: [
      [69.14889, 41.26098], [69.14897, 41.26089], [69.15047, 41.25947], [69.15385, 41.25698], [69.1614, 41.25231], [69.16349, 41.25021],
      [69.16426, 41.2488], [69.16707, 41.24031], [69.16664, 41.23953], [69.16576, 41.23857], [69.16542, 41.23661], [69.16645, 41.2355],
      [69.16835, 41.23511], [69.16935, 41.23453], [69.17359, 41.22919], [69.17411, 41.22832], [69.17383, 41.2271], [69.17221, 41.22636],
      [69.17228, 41.22625], [69.17194, 41.22604], [69.17254, 41.22549], [69.17205, 41.22519], [69.17429, 41.22274], [69.17446, 41.22257],
      [69.17539, 41.22379], [69.18458, 41.23296], [69.18806, 41.23629], [69.19038, 41.23787], [69.19495, 41.24073], [69.19517, 41.24082],
      [69.20848, 41.24909], [69.21466, 41.25269], [69.21533, 41.25306], [69.21532, 41.25308], [69.2143, 41.2544], [69.21393, 41.25563],
      [69.21441, 41.25661], [69.21543, 41.25809], [69.2158, 41.25917], [69.2171, 41.26114], [69.2182, 41.26236], [69.21846, 41.26374],
      [69.21838, 41.26474], [69.22066, 41.26686], [69.22121, 41.26842], [69.22172, 41.26904], [69.22169, 41.26958], [69.22275, 41.27055],
      [69.2234, 41.272], [69.22439, 41.27282], [69.22552, 41.27451], [69.22598, 41.27566], [69.22926, 41.27833], [69.23003, 41.27923],
      [69.23135, 41.27963], [69.23188, 41.2801], [69.2327, 41.28018], [69.23454, 41.28125], [69.23507, 41.28614], [69.23541, 41.28654],
      [69.23675, 41.28716], [69.23752, 41.28839], [69.23795, 41.28969], [69.2377, 41.2909], [69.23777, 41.29194], [69.23943, 41.29353],
      [69.24014, 41.29392], [69.24053, 41.29486], [69.24153, 41.29514], [69.24202, 41.29603], [69.24205, 41.29736], [69.24325, 41.29767],
      [69.24638, 41.29914], [69.25089, 41.30159], [69.2516, 41.30226], [69.25234, 41.30226], [69.25356, 41.30354], [69.25368, 41.30436],
      [69.2535, 41.30507], [69.25444, 41.30576], [69.25539, 41.30612], [69.25768, 41.30837], [69.25888, 41.31002], [69.25957, 41.31037],
      [69.25987, 41.31072], [69.25997, 41.3111], [69.25965, 41.31117], [69.24144, 41.31194], [69.23351, 41.30176], [69.23157, 41.29959],
      [69.22332, 41.30226], [69.22231, 41.30221], [69.22054, 41.30134], [69.21902, 41.30103], [69.2019, 41.30057], [69.20043, 41.30072],
      [69.19823, 41.30169], [69.19699, 41.30185], [69.19427, 41.30284], [69.19371, 41.30302], [69.19371, 41.30213], [69.19465, 41.28103],
      [69.19452, 41.28092], [69.19791, 41.27875], [69.19595, 41.27671], [69.19317, 41.27527], [69.17741, 41.27155], [69.17604, 41.2711],
      [69.17225, 41.26882], [69.17118, 41.26983], [69.1678, 41.26778], [69.16419, 41.26878], [69.16387, 41.26863], [69.16256, 41.26696],
      [69.16192, 41.26643], [69.1583, 41.26447], [69.14948, 41.26131],
    ],
  },
  {
    id: 'yakkasaroy',
    name: {"uz":"Yakkasaroy tumani","ru":"Яккасарайский район","en":"Yakkasaroy District"},
    shortName: {"uz":"Yakkasaroy","ru":"Яккасарай","en":"Yakkasaroy"},
    center: { latitude: 41.274, longitude: 69.247 },
    polygon: [
      [69.21532, 41.25308], [69.21533, 41.25306], [69.21583, 41.25333], [69.23356, 41.2617], [69.23509, 41.26222], [69.23997, 41.26314],
      [69.24256, 41.26388], [69.26144, 41.26725], [69.26264, 41.2677], [69.26613, 41.27027], [69.27302, 41.27785], [69.26911, 41.28013],
      [69.26655, 41.2835], [69.26591, 41.28323], [69.26522, 41.28404], [69.26467, 41.28437], [69.265, 41.28469], [69.26518, 41.28519],
      [69.26636, 41.2856], [69.26574, 41.2874], [69.26637, 41.28755], [69.26758, 41.28861], [69.26909, 41.28946], [69.26913, 41.29063],
      [69.27005, 41.29153], [69.26994, 41.29172], [69.2714, 41.29263], [69.27006, 41.29391], [69.26877, 41.29546], [69.26907, 41.29595],
      [69.26862, 41.29649], [69.26754, 41.30051], [69.26634, 41.30223], [69.26712, 41.30417], [69.26713, 41.30452], [69.26911, 41.309],
      [69.26897, 41.30903], [69.26759, 41.30937], [69.26742, 41.30942], [69.26393, 41.31072], [69.26028, 41.311], [69.25997, 41.3111],
      [69.25987, 41.31072], [69.25957, 41.31037], [69.25888, 41.31002], [69.25768, 41.30837], [69.25539, 41.30612], [69.25444, 41.30576],
      [69.2535, 41.30507], [69.25368, 41.30436], [69.25356, 41.30354], [69.25234, 41.30226], [69.2516, 41.30226], [69.25089, 41.30159],
      [69.24638, 41.29914], [69.24325, 41.29767], [69.24205, 41.29736], [69.24202, 41.29603], [69.24153, 41.29514], [69.24053, 41.29486],
      [69.24014, 41.29392], [69.23943, 41.29353], [69.23777, 41.29194], [69.2377, 41.2909], [69.23795, 41.28969], [69.23752, 41.28839],
      [69.23675, 41.28716], [69.23541, 41.28654], [69.23507, 41.28614], [69.23454, 41.28125], [69.2327, 41.28018], [69.23188, 41.2801],
      [69.23135, 41.27963], [69.23003, 41.27923], [69.22926, 41.27833], [69.22598, 41.27566], [69.22552, 41.27451], [69.22439, 41.27282],
      [69.2234, 41.272], [69.22275, 41.27055], [69.22169, 41.26958], [69.22172, 41.26904], [69.22121, 41.26842], [69.22066, 41.26686],
      [69.21838, 41.26474], [69.21846, 41.26374], [69.2182, 41.26236], [69.2171, 41.26114], [69.2158, 41.25917], [69.21543, 41.25809],
      [69.21441, 41.25661], [69.21393, 41.25563], [69.2143, 41.2544],
    ],
  },
  {
    id: 'mirobod',
    name: {"uz":"Mirobod tumani","ru":"Мирабадский район","en":"Mirobod District"},
    shortName: {"uz":"Mirobod","ru":"Мирабад","en":"Mirobod"},
    center: { latitude: 41.289, longitude: 69.288 },
    polygon: [
      [69.26144, 41.26725], [69.26468, 41.26785], [69.2758, 41.26982], [69.27805, 41.27031], [69.28124, 41.27128], [69.28357, 41.27146],
      [69.28552, 41.27108], [69.28712, 41.27026], [69.29292, 41.26555], [69.2939, 41.26502], [69.29571, 41.26453], [69.29742, 41.26451],
      [69.2975, 41.26334], [69.29798, 41.263], [69.30055, 41.26302], [69.30232, 41.26209], [69.30278, 41.26202], [69.30745, 41.26448],
      [69.30788, 41.2646], [69.30822, 41.26451], [69.31063, 41.26117], [69.31068, 41.26075], [69.30287, 41.25739], [69.30116, 41.25717],
      [69.30193, 41.25576], [69.30214, 41.25481], [69.30223, 41.25269], [69.30175, 41.25255], [69.30162, 41.25234], [69.30161, 41.24417],
      [69.31235, 41.24399], [69.31509, 41.24299], [69.31698, 41.24153], [69.32123, 41.23783], [69.32188, 41.23773], [69.32305, 41.23748],
      [69.32325, 41.23773], [69.32406, 41.23792], [69.32514, 41.23915], [69.32897, 41.24096], [69.32913, 41.241], [69.32866, 41.24159],
      [69.31086, 41.273], [69.3075, 41.27908], [69.30746, 41.27948], [69.3055, 41.28325], [69.3029, 41.28747], [69.29983, 41.29118],
      [69.29418, 41.29715], [69.29327, 41.29664], [69.29224, 41.29775], [69.29206, 41.29808], [69.29189, 41.29973], [69.29105, 41.30024],
      [69.29078, 41.30003], [69.29023, 41.30045], [69.28565, 41.30521], [69.28082, 41.3099], [69.28083, 41.30994], [69.28051, 41.30993],
      [69.27759, 41.31048], [69.27051, 41.3124], [69.26961, 41.31042], [69.26823, 41.31077], [69.26764, 41.30947], [69.26759, 41.30937],
      [69.26897, 41.30903], [69.26911, 41.309], [69.26713, 41.30452], [69.26712, 41.30417], [69.26634, 41.30223], [69.26754, 41.30051],
      [69.26862, 41.29649], [69.26907, 41.29595], [69.26877, 41.29546], [69.27006, 41.29391], [69.2714, 41.29263], [69.26994, 41.29172],
      [69.27005, 41.29153], [69.26913, 41.29063], [69.26909, 41.28946], [69.26758, 41.28861], [69.26637, 41.28755], [69.26574, 41.2874],
      [69.26636, 41.2856], [69.26518, 41.28519], [69.265, 41.28469], [69.26467, 41.28437], [69.26522, 41.28404], [69.26591, 41.28323],
      [69.26655, 41.2835], [69.26911, 41.28013], [69.27302, 41.27785], [69.26613, 41.27027], [69.26264, 41.2677],
    ],
  },
  {
    id: 'yashnobod',
    name: {"uz":"Yashnobod tumani","ru":"Яшнабадский район","en":"Yashnobod District"},
    shortName: {"uz":"Yashnobod","ru":"Яшнабад","en":"Yashnobod"},
    center: { latitude: 41.288, longitude: 69.355 },
    polygon: [
      [69.28082, 41.3099], [69.28565, 41.30521], [69.29023, 41.30045], [69.29078, 41.30003], [69.29105, 41.30024], [69.29189, 41.29973],
      [69.29206, 41.29808], [69.29224, 41.29775], [69.29327, 41.29664], [69.29418, 41.29715], [69.29983, 41.29118], [69.3029, 41.28747],
      [69.3055, 41.28325], [69.30746, 41.27948], [69.3075, 41.27908], [69.31086, 41.273], [69.32866, 41.24159], [69.32913, 41.241],
      [69.32923, 41.24087], [69.33087, 41.2381], [69.33374, 41.23918], [69.33742, 41.24282], [69.33879, 41.24376], [69.34035, 41.24438],
      [69.34746, 41.24631], [69.35179, 41.2485], [69.35472, 41.25064], [69.35609, 41.25206], [69.36641, 41.26696], [69.36727, 41.26742],
      [69.36748, 41.2677], [69.36898, 41.26766], [69.37007, 41.26832], [69.37114, 41.26863], [69.37298, 41.26961], [69.37471, 41.27029],
      [69.37481, 41.2707], [69.37598, 41.27204], [69.37956, 41.27414], [69.37987, 41.27359], [69.37998, 41.27249], [69.37993, 41.27015],
      [69.38356, 41.26956], [69.38412, 41.27048], [69.38654, 41.27328], [69.38942, 41.27479], [69.39474, 41.27924], [69.40135, 41.28525],
      [69.40684, 41.28948], [69.41138, 41.29258], [69.42012, 41.30001], [69.42483, 41.30332], [69.42716, 41.30594], [69.42876, 41.30718],
      [69.43025, 41.30884], [69.43165, 41.30959], [69.43477, 41.31073], [69.4388, 41.31422], [69.44841, 41.3193], [69.44963, 41.32082],
      [69.45211, 41.32222], [69.45427, 41.32405], [69.45639, 41.32618], [69.45782, 41.32828], [69.46379, 41.33136], [69.46822, 41.33496],
      [69.47158, 41.33808], [69.47402, 41.3449], [69.47714, 41.34704], [69.47424, 41.34912], [69.46992, 41.34738], [69.46147, 41.34563],
      [69.4573, 41.3452], [69.44045, 41.34481], [69.40789, 41.34222], [69.39747, 41.33769], [69.39479, 41.33732], [69.39315, 41.33734],
      [69.3871, 41.33841], [69.38612, 41.33846], [69.3848, 41.33836], [69.38093, 41.33746], [69.37965, 41.3364], [69.37836, 41.33403],
      [69.37539, 41.33036], [69.35465, 41.31564], [69.34365, 41.30954], [69.34175, 41.30699], [69.34057, 41.30621], [69.33952, 41.3061],
      [69.33562, 41.30963], [69.32874, 41.31449], [69.32061, 41.31547], [69.31695, 41.31671], [69.31343, 41.31818], [69.31096, 41.31892],
      [69.31037, 41.31701], [69.30912, 41.31524], [69.30788, 41.31401], [69.30766, 41.31274], [69.30747, 41.31259], [69.30667, 41.31291],
      [69.30608, 41.31265], [69.30571, 41.31272], [69.30507, 41.31217], [69.30384, 41.31189], [69.30276, 41.31206], [69.30233, 41.31267],
      [69.30173, 41.31256], [69.3012, 41.31181], [69.30135, 41.31169], [69.30027, 41.31031], [69.29947, 41.31054], [69.29849, 41.30966],
      [69.2985, 41.30923], [69.29824, 41.3092], [69.29823, 41.30786], [69.29844, 41.30759], [69.29893, 41.30757], [69.29595, 41.30701],
      [69.29411, 41.30713], [69.28177, 41.31063], [69.28159, 41.31084], [69.28155, 41.31107], [69.28153, 41.31097], [69.28102, 41.31012],
      [69.28083, 41.30994],
    ],
  },
  {
    id: 'sergeli',
    name: {"uz":"Sergeli tumani","ru":"Сергелийский район","en":"Sergeli District"},
    shortName: {"uz":"Sergeli","ru":"Сергели","en":"Sergeli"},
    center: { latitude: 41.236, longitude: 69.252 },
    polygon: [
      [69.19495, 41.24073], [69.19499, 41.24043], [69.19531, 41.23937], [69.19589, 41.23851], [69.22011, 41.20513], [69.24501, 41.21546],
      [69.24681, 41.20336], [69.24748, 41.2003], [69.24803, 41.19883], [69.24871, 41.19766], [69.25134, 41.1948], [69.25434, 41.19274],
      [69.25678, 41.19439], [69.2614, 41.19808], [69.26335, 41.19912], [69.27015, 41.20192], [69.27612, 41.20519], [69.28133, 41.20956],
      [69.28686, 41.21531], [69.28966, 41.22066], [69.29848, 41.22508], [69.29769, 41.22621], [69.30288, 41.22742], [69.30223, 41.22863],
      [69.30695, 41.22994], [69.30799, 41.23007], [69.30773, 41.23097], [69.30829, 41.23116], [69.30843, 41.23137], [69.30829, 41.23191],
      [69.31216, 41.23289], [69.31736, 41.2372], [69.32122, 41.23769], [69.32123, 41.23783], [69.31698, 41.24153], [69.31509, 41.24299],
      [69.31235, 41.24399], [69.30161, 41.24417], [69.30162, 41.25234], [69.30175, 41.25255], [69.30223, 41.25269], [69.30214, 41.25481],
      [69.30193, 41.25576], [69.30116, 41.25717], [69.30287, 41.25739], [69.31068, 41.26075], [69.31063, 41.26117], [69.30822, 41.26451],
      [69.30788, 41.2646], [69.30745, 41.26448], [69.30278, 41.26202], [69.30232, 41.26209], [69.30055, 41.26302], [69.29798, 41.263],
      [69.2975, 41.26334], [69.29742, 41.26451], [69.29571, 41.26453], [69.2939, 41.26502], [69.29292, 41.26555], [69.28712, 41.27026],
      [69.28552, 41.27108], [69.28357, 41.27146], [69.28124, 41.27128], [69.27805, 41.27031], [69.2758, 41.26982], [69.26468, 41.26785],
      [69.26144, 41.26725], [69.24256, 41.26388], [69.23997, 41.26314], [69.23509, 41.26222], [69.23356, 41.2617], [69.21583, 41.25333],
      [69.21533, 41.25306], [69.21466, 41.25269], [69.20848, 41.24909], [69.19517, 41.24082],
    ],
  },
  {
    id: 'yangihayot',
    name: {"uz":"Yangihayot tumani","ru":"Янгихаётский район","en":"Yangihayot District"},
    shortName: {"uz":"Yangihayot","ru":"Янгихаёт","en":"Yangihayot"},
    center: { latitude: 41.192, longitude: 69.227 },
    polygon: [
      [69.30647, 41.18193], [69.30735, 41.18262], [69.29701, 41.18995], [69.29263, 41.19126], [69.28833, 41.19437], [69.2862, 41.19735],
      [69.27967, 41.20235], [69.27612, 41.20519], [69.27015, 41.20192], [69.26335, 41.19912], [69.2614, 41.19808], [69.25678, 41.19439],
      [69.25434, 41.19274], [69.25134, 41.1948], [69.24871, 41.19766], [69.24803, 41.19883], [69.24748, 41.2003], [69.24681, 41.20336],
      [69.24501, 41.21546], [69.22011, 41.20513], [69.19589, 41.23851], [69.19531, 41.23937], [69.19499, 41.24043], [69.19495, 41.24073],
      [69.19038, 41.23787], [69.18806, 41.23629], [69.18458, 41.23296], [69.17539, 41.22379], [69.17446, 41.22257], [69.17404, 41.22176],
      [69.17395, 41.22167], [69.1755, 41.22133], [69.17456, 41.21881], [69.17639, 41.21765], [69.17779, 41.21906], [69.1797, 41.21807],
      [69.1806, 41.21907], [69.18382, 41.21682], [69.18379, 41.21664], [69.18154, 41.21455], [69.18513, 41.21197], [69.18533, 41.21154],
      [69.18524, 41.21037], [69.18326, 41.20831], [69.18323, 41.20731], [69.18309, 41.20702], [69.18238, 41.2067], [69.18287, 41.20595],
      [69.18585, 41.20486], [69.18509, 41.20271], [69.18498, 41.20068], [69.18526, 41.1986], [69.18639, 41.1962], [69.20188, 41.17887],
      [69.20296, 41.17784], [69.2049, 41.17638], [69.20798, 41.17472], [69.22855, 41.16813], [69.23113, 41.16716], [69.23829, 41.16568],
      [69.2468, 41.16593], [69.25703, 41.16473], [69.25738, 41.16493], [69.25876, 41.16477], [69.2592, 41.16447], [69.26296, 41.16419],
      [69.26335, 41.16429], [69.26902, 41.16361], [69.27294, 41.16358], [69.27683, 41.16408], [69.27954, 41.16485], [69.28247, 41.16612],
      [69.29561, 41.17456], [69.29888, 41.17619],
    ],
  },
  {
    id: 'bektemir',
    name: {"uz":"Bektemir tumani","ru":"Бектемирский район","en":"Bektemir District"},
    shortName: {"uz":"Bektemir","ru":"Бектемир","en":"Bektemir"},
    center: { latitude: 41.218, longitude: 69.322 },
    polygon: [
      [69.27612, 41.20519], [69.27967, 41.20235], [69.2862, 41.19735], [69.28833, 41.19437], [69.29263, 41.19126], [69.29701, 41.18995],
      [69.30735, 41.18262], [69.31337, 41.18741], [69.33403, 41.20287], [69.33616, 41.20478], [69.35359, 41.21735], [69.37989, 41.23429],
      [69.39235, 41.24244], [69.39268, 41.24279], [69.39326, 41.2437], [69.3934, 41.24492], [69.39304, 41.24622], [69.39208, 41.24771],
      [69.38372, 41.2543], [69.38386, 41.25445], [69.37441, 41.26201], [69.37574, 41.26293], [69.37695, 41.26404], [69.37868, 41.26657],
      [69.37941, 41.26819], [69.37993, 41.27015], [69.37998, 41.27249], [69.37987, 41.27359], [69.37956, 41.27414], [69.37598, 41.27204],
      [69.37481, 41.2707], [69.37471, 41.27029], [69.37298, 41.26961], [69.37114, 41.26863], [69.37007, 41.26832], [69.36898, 41.26766],
      [69.36748, 41.2677], [69.36727, 41.26742], [69.36641, 41.26696], [69.35609, 41.25206], [69.35472, 41.25064], [69.35179, 41.2485],
      [69.34746, 41.24631], [69.34035, 41.24438], [69.33879, 41.24376], [69.33742, 41.24282], [69.33374, 41.23918], [69.33087, 41.2381],
      [69.32923, 41.24087], [69.32913, 41.241], [69.32897, 41.24096], [69.32514, 41.23915], [69.32406, 41.23792], [69.32325, 41.23773],
      [69.32305, 41.23748], [69.32188, 41.23773], [69.32123, 41.23783], [69.32122, 41.23769], [69.31736, 41.2372], [69.31216, 41.23289],
      [69.30829, 41.23191], [69.30843, 41.23137], [69.30829, 41.23116], [69.30773, 41.23097], [69.30799, 41.23007], [69.30695, 41.22994],
      [69.30223, 41.22863], [69.30288, 41.22742], [69.29769, 41.22621], [69.29848, 41.22508], [69.28966, 41.22066], [69.28686, 41.21531],
      [69.28133, 41.20956],
    ],
  },
];

export const TASHKENT_DISTRICT_MAP = new Map<TashkentDistrictId, TashkentDistrictShape>(
  TASHKENT_DISTRICTS.map(d => [d.id, d]),
);
