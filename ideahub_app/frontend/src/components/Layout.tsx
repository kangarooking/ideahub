import { Outlet, NavLink } from 'react-router-dom';
import { Home, PlusCircle, Settings, Lightbulb, Download } from 'lucide-react';
import { motion } from 'framer-motion';

function Layout() {
  const navItems = [
    { to: '/', icon: Home, label: '首页' },
    { to: '/create', icon: PlusCircle, label: '新建' },
    { to: '/crawler', icon: Download, label: '采集' },
    { to: '/settings', icon: Settings, label: '设置' },
  ];

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--memphis-bg)' }}>
      {/* 侧边栏 - 孟菲斯风格 */}
      <aside 
        className="w-16 md:w-64 flex flex-col border-r-[3px]"
        style={{ 
          backgroundColor: 'var(--memphis-secondary)',
          borderColor: 'var(--memphis-dark)'
        }}
      >
        {/* Logo 区域 */}
        <div 
          className="h-20 flex items-center justify-center md:justify-start md:px-5 border-b-[3px] relative overflow-hidden"
          style={{ borderColor: 'var(--memphis-dark)' }}
        >
          {/* 装饰圆形 - 隐藏在移动端 */}
          <div 
            className="hidden md:block absolute -top-3 -right-3 w-12 h-12 rounded-full border-[3px]"
            style={{ 
              backgroundColor: 'var(--memphis-accent1)',
              borderColor: 'var(--memphis-dark)'
            }}
          />
          
          {/* Logo 图标容器 */}
          <motion.div 
            className="relative z-10 p-2 rounded-xl border-[3px]"
            style={{ 
              backgroundColor: 'var(--memphis-accent1)',
              borderColor: 'var(--memphis-dark)',
              boxShadow: '3px 3px 0 var(--memphis-dark)'
            }}
            whileHover={{ 
              rotate: [0, -10, 10, -10, 0],
              transition: { duration: 0.5 }
            }}
          >
            <Lightbulb 
              className="w-7 h-7" 
              style={{ color: 'var(--memphis-dark)' }}
              strokeWidth={2.5}
            />
          </motion.div>
          
          {/* Logo 文字 */}
          <span 
            className="hidden md:inline ml-3 text-2xl font-black tracking-tight"
            style={{ 
              color: 'var(--memphis-dark)',
              textShadow: '2px 2px 0 var(--memphis-accent1)'
            }}
          >
            IdeaHub
          </span>
        </div>

        {/* 导航链接 */}
        <nav className="flex-1 py-5 px-2 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="block"
            >
              {({ isActive }) => (
                <motion.div
                  className={`
                    flex items-center justify-center md:justify-start 
                    px-3 md:px-4 py-3 rounded-xl border-[3px] 
                    font-bold transition-colors relative
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--memphis-accent1)' : 'white',
                    borderColor: 'var(--memphis-dark)',
                    color: 'var(--memphis-dark)',
                    boxShadow: isActive 
                      ? '3px 3px 0 var(--memphis-dark)' 
                      : '2px 2px 0 var(--memphis-dark)'
                  }}
                  whileHover={{ 
                    scale: 1.02,
                    x: -2,
                    y: -2,
                    boxShadow: '4px 4px 0 var(--memphis-dark)'
                  }}
                  whileTap={{ 
                    scale: 0.98,
                    x: 1,
                    y: 1,
                    boxShadow: '1px 1px 0 var(--memphis-dark)'
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {/* Active 状态左侧指示条 */}
                  {isActive && (
                    <motion.div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-r-full hidden md:block"
                      style={{ backgroundColor: 'var(--memphis-primary)' }}
                      layoutId="activeIndicator"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  
                  <motion.div
                    animate={isActive ? { 
                      rotate: [0, -5, 5, 0],
                    } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <item.icon 
                      className="w-5 h-5" 
                      strokeWidth={2.5}
                    />
                  </motion.div>
                  
                  <span className="hidden md:inline ml-3 text-sm">
                    {item.label}
                  </span>
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 底部装饰区域 */}
        <div 
          className="p-3 border-t-[3px] relative"
          style={{ borderColor: 'var(--memphis-dark)' }}
        >
          {/* 几何装饰 */}
          <div className="hidden md:flex justify-center gap-2 mb-3">
            <motion.div 
              className="w-4 h-4 rounded-full border-2"
              style={{ 
                backgroundColor: 'var(--memphis-primary)',
                borderColor: 'var(--memphis-dark)'
              }}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div 
              className="w-4 h-4 border-2"
              style={{ 
                backgroundColor: 'var(--memphis-accent1)',
                borderColor: 'var(--memphis-dark)',
                transform: 'rotate(45deg)'
              }}
              animate={{ rotate: [45, 135, 45] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div 
              className="w-0 h-0"
              style={{ 
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderBottom: '14px solid var(--memphis-accent5)',
              }}
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            />
          </div>
          
          <p 
            className="hidden md:block text-xs text-center font-bold"
            style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}
          >
            IdeaHub v1.0.0
          </p>
        </div>
      </aside>

      {/* 主内容区域 */}
      <main 
        className="flex-1 overflow-auto memphis-dot-pattern-soft"
        style={{ backgroundColor: 'var(--memphis-bg)' }}
      >
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
