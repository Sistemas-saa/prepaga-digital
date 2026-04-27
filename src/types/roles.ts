// Roles de la aplicación
export type AppRole = 'super_admin' | 'admin' | 'supervisor' | 'auditor' | 'gestor' | 'vendedor' | 'financiero';

// Permisos por recurso
export interface RolePermissions {
  // Gestión de Empresas
  companies: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    switch: boolean;
  };
  
  // Gestión de Usuarios
  users: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    assignRoles: boolean;
    viewAll: boolean;
  };
  
  // Gestión de Planes
  plans: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    updatePricing: boolean;
  };
  
  // Gestión de Templates
  templates: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    design: boolean;
    publish: boolean;
  };
  
  // Gestión de Clientes
  clients: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    viewAll: boolean;
    export: boolean;
  };
  
  // Gestión de Ventas
  sales: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    viewAll: boolean;
    changeStatus: boolean;
    sendSignature: boolean;
    resendSignature: boolean;
    viewSignatures: boolean;
  };
  
  // Gestión de Documentos
  documents: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    upload: boolean;
    download: boolean;
    generate: boolean;
    sign: boolean;
  };
  
  // Auditoría
  audit: {
    access: boolean;
    approve: boolean;
    reject: boolean;
    viewAll: boolean;
    assignAuditor: boolean;
  };
  
  // Comunicaciones
  communications: {
    sendWhatsApp: boolean;
    sendEmail: boolean;
    sendSMS: boolean;
    viewHistory: boolean;
    createCampaigns: boolean;
  };
  
  // Configuración
  settings: {
    company: boolean;
    integrations: boolean;
    billing: boolean;
    currencies: boolean;
    ui: boolean;
  };
  
  // Reportes y Analytics
  analytics: {
    viewDashboard: boolean;
    viewReports: boolean;
    exportReports: boolean;
    viewAllMetrics: boolean;
  };
}

// Definición de permisos por rol
export const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  super_admin: {
    companies: {
      create: true,
      read: true,
      update: true,
      delete: true,
      switch: true,
    },
    users: {
      create: true,
      read: true,
      update: true,
      delete: true,
      assignRoles: true,
      viewAll: true,
    },
    plans: {
      create: true,
      read: true,
      update: true,
      delete: true,
      updatePricing: true,
    },
    templates: {
      create: true,
      read: true,
      update: true,
      delete: true,
      design: true,
      publish: true,
    },
    clients: {
      create: true,
      read: true,
      update: true,
      delete: true,
      viewAll: true,
      export: true,
    },
    sales: {
      create: true,
      read: true,
      update: true,
      delete: true,
      viewAll: true,
      changeStatus: true,
      sendSignature: true,
      resendSignature: true,
      viewSignatures: true,
    },
    documents: {
      create: true,
      read: true,
      update: true,
      delete: true,
      upload: true,
      download: true,
      generate: true,
      sign: true,
    },
    audit: {
      access: true,
      approve: true,
      reject: true,
      viewAll: true,
      assignAuditor: true,
    },
    communications: {
      sendWhatsApp: true,
      sendEmail: true,
      sendSMS: true,
      viewHistory: true,
      createCampaigns: true,
    },
    settings: {
      company: true,
      integrations: true,
      billing: true,
      currencies: true,
      ui: true,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: true,
      viewAllMetrics: true,
    },
  },
  
  admin: {
    companies: {
      create: false,
      read: true,
      update: true,
      delete: false,
      switch: false,
    },
    users: {
      create: true,
      read: true,
      update: true,
      delete: true,
      assignRoles: true,
      viewAll: true,
    },
    plans: {
      create: true,
      read: true,
      update: true,
      delete: true,
      updatePricing: true,
    },
    templates: {
      create: true,
      read: true,
      update: true,
      delete: true,
      design: true,
      publish: true,
    },
    clients: {
      create: true,
      read: true,
      update: true,
      delete: true,
      viewAll: true,
      export: true,
    },
    sales: {
      create: true,
      read: true,
      update: true,
      delete: true,
      viewAll: true,
      changeStatus: true,
      sendSignature: true,
      resendSignature: true,
      viewSignatures: true,
    },
    documents: {
      create: true,
      read: true,
      update: true,
      delete: true,
      upload: true,
      download: true,
      generate: true,
      sign: true,
    },
    audit: {
      access: true,
      approve: true,
      reject: true,
      viewAll: true,
      assignAuditor: true,
    },
    communications: {
      sendWhatsApp: true,
      sendEmail: true,
      sendSMS: true,
      viewHistory: true,
      createCampaigns: true,
    },
    settings: {
      company: true,
      integrations: true,
      billing: true,
      currencies: true,
      ui: true,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: true,
      viewAllMetrics: true,
    },
  },
  
  supervisor: {
    companies: {
      create: false,
      read: true,
      update: false,
      delete: false,
      switch: false,
    },
    users: {
      create: true,
      read: true,
      update: true,
      delete: false,
      assignRoles: false,
      viewAll: true,
    },
    plans: {
      create: true,
      read: true,
      update: true,
      delete: false,
      updatePricing: true,
    },
    templates: {
      create: true,
      read: true,
      update: true,
      delete: false,
      design: true,
      publish: true,
    },
    clients: {
      create: true,
      read: true,
      update: true,
      delete: false,
      viewAll: true,
      export: true,
    },
    sales: {
      create: false,
      read: true,
      update: false,
      delete: false,
      viewAll: true,
      changeStatus: false,
      sendSignature: false,
      resendSignature: false,
      viewSignatures: true,
    },
    documents: {
      create: false,
      read: true,
      update: false,
      delete: false,
      upload: false,
      download: true,
      generate: true,
      sign: false,
    },
    audit: {
      access: true,
      approve: false,
      reject: false,
      viewAll: true,
      assignAuditor: true,
    },
    communications: {
      sendWhatsApp: false,
      sendEmail: false,
      sendSMS: false,
      viewHistory: true,
      createCampaigns: false,
    },
    settings: {
      company: false,
      integrations: false,
      billing: false,
      currencies: false,
      ui: false,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: true,
      viewAllMetrics: true,
    },
  },
  
  auditor: {
    companies: {
      create: false,
      read: true,
      update: false,
      delete: false,
      switch: false,
    },
    users: {
      create: false,
      read: true,
      update: false,
      delete: false,
      assignRoles: false,
      viewAll: false,
    },
    plans: {
      create: false,
      read: true,
      update: false,
      delete: false,
      updatePricing: false,
    },
    templates: {
      create: false,
      read: true,
      update: false,
      delete: false,
      design: false,
      publish: false,
    },
    clients: {
      create: false,
      read: true,
      update: false,
      delete: false,
      viewAll: true,
      export: false,
    },
    sales: {
      create: false,
      read: true,
      update: false,
      delete: false,
      viewAll: true,
      changeStatus: false,
      sendSignature: false,
      resendSignature: false,
      viewSignatures: true,
    },
    documents: {
      create: false,
      read: true,
      update: false,
      delete: false,
      upload: false,
      download: true,
      generate: false,
      sign: false,
    },
    audit: {
      access: true,
      approve: true,
      reject: true,
      viewAll: true,
      assignAuditor: false,
    },
    communications: {
      sendWhatsApp: false,
      sendEmail: false,
      sendSMS: false,
      viewHistory: true,
      createCampaigns: false,
    },
    settings: {
      company: false,
      integrations: false,
      billing: false,
      currencies: false,
      ui: false,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: false,
      viewAllMetrics: false,
    },
  },
  
  gestor: {
    companies: {
      create: false,
      read: true,
      update: false,
      delete: false,
      switch: false,
    },
    users: {
      create: false,
      read: true,
      update: false,
      delete: false,
      assignRoles: false,
      viewAll: true,
    },
    plans: {
      create: false,
      read: true,
      update: false,
      delete: false,
      updatePricing: false,
    },
    templates: {
      create: false,
      read: true,
      update: false,
      delete: false,
      design: false,
      publish: false,
    },
    clients: {
      create: true,
      read: true,
      update: true,
      delete: false,
      viewAll: true,
      export: true,
    },
    sales: {
      create: true,
      read: true,
      update: true,
      delete: false,
      viewAll: true,
      changeStatus: true,
      sendSignature: true,
      resendSignature: true,
      viewSignatures: true,
    },
    documents: {
      create: true,
      read: true,
      update: true,
      delete: false,
      upload: true,
      download: true,
      generate: true,
      sign: false,
    },
    audit: {
      access: false,
      approve: false,
      reject: false,
      viewAll: false,
      assignAuditor: false,
    },
    communications: {
      sendWhatsApp: true,
      sendEmail: true,
      sendSMS: false,
      viewHistory: true,
      createCampaigns: false,
    },
    settings: {
      company: false,
      integrations: false,
      billing: false,
      currencies: false,
      ui: true,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: true,
      viewAllMetrics: true,
    },
  },
  
  vendedor: {
    companies: {
      create: false,
      read: true,
      update: false,
      delete: false,
      switch: false,
    },
    users: {
      create: false,
      read: false,
      update: false,
      delete: false,
      assignRoles: false,
      viewAll: false,
    },
    plans: {
      create: false,
      read: true,
      update: false,
      delete: false,
      updatePricing: false,
    },
    templates: {
      create: false,
      read: true,
      update: false,
      delete: false,
      design: false,
      publish: false,
    },
    clients: {
      create: true,
      read: true,
      update: true,
      delete: false,
      viewAll: false,
      export: false,
    },
    sales: {
      create: true,
      read: true,
      update: true,
      delete: false,
      viewAll: false,
      changeStatus: true,
      sendSignature: true,
      resendSignature: true,
      viewSignatures: true,
    },
    documents: {
      create: true,
      read: true,
      update: true,
      delete: false,
      upload: true,
      download: true,
      generate: true,
      sign: false,
    },
    audit: {
      access: true,
      approve: true,
      reject: false,
      viewAll: false, // solo sus propias ventas
      assignAuditor: false,
    },
    communications: {
      sendWhatsApp: true,
      sendEmail: true,
      sendSMS: false,
      viewHistory: true,
      createCampaigns: false,
    },
    settings: {
      company: false,
      integrations: false,
      billing: false,
      currencies: false,
      ui: true,
    },
    analytics: {
      viewDashboard: true,
      viewReports: false,
      exportReports: false,
      viewAllMetrics: false,
    },
  },

  financiero: {
    companies: {
      create: false,
      read: false,
      update: false,
      delete: false,
      switch: false,
    },
    users: {
      create: false,
      read: false,
      update: false,
      delete: false,
      assignRoles: false,
      viewAll: false,
    },
    plans: {
      create: false,
      read: false,
      update: false,
      delete: false,
      updatePricing: false,
    },
    templates: {
      create: false,
      read: false,
      update: false,
      delete: false,
      design: false,
      publish: false,
    },
    clients: {
      create: false,
      read: false,
      update: false,
      delete: false,
      viewAll: false,
      export: false,
    },
    sales: {
      create: false,
      read: false,
      update: false,
      delete: false,
      viewAll: false,
      changeStatus: false,
      sendSignature: false,
      resendSignature: false,
      viewSignatures: false,
    },
    documents: {
      create: false,
      read: false,
      update: false,
      delete: false,
      upload: false,
      download: false,
      generate: false,
      sign: false,
    },
    audit: {
      access: false,
      approve: false,
      reject: false,
      viewAll: false,
      assignAuditor: false,
    },
    communications: {
      sendWhatsApp: false,
      sendEmail: false,
      sendSMS: false,
      viewHistory: false,
      createCampaigns: false,
    },
    settings: {
      company: false,
      integrations: false,
      billing: false,
      currencies: false,
      ui: false,
    },
    analytics: {
      viewDashboard: true,
      viewReports: true,
      exportReports: true,
      viewAllMetrics: true,
    },
  },
};

// Etiquetas de roles para UI
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  auditor: 'Auditor',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
  financiero: 'Financiero',
};

// Colores de roles para badges
export const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: 'bg-purple-500',
  admin: 'bg-blue-500',
  supervisor: 'bg-indigo-500',
  auditor: 'bg-amber-500',
  gestor: 'bg-teal-500',
  vendedor: 'bg-green-500',
  financiero: 'bg-emerald-600',
};
