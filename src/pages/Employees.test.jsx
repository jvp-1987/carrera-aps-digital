import { render, screen } from '@testing-library/react';
import Employees from './Employees';

vi.mock('@/hooks/useEmployees', () => ({
  useEmployees: () => ({
    data: [
      { id: '1', name: 'Ana', rut: '12345678-9', category: 'A', status: 'Activo', department: 'Santiago' },
    ],
    isLoading: false,
    isError: false,
    error: null
  })
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() }}));

describe('Employees page', () => {
  it('muestra la lista y el contador', () => {
    render(<Employees />);
    expect(screen.getByText('Funcionarios')).toBeInTheDocument();
    expect(screen.getByText('1 de 1 funcionarios')).toBeInTheDocument();
  });
});